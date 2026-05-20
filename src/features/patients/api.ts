import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { utils as xlsxUtils, writeFile as xlsxWriteFile } from 'xlsx';
import { apiFetch } from '@/core/api/client';
import type { Patient, PaginatedResult } from '@/shared/types';
import { queryKeys } from '@/core/api/queryKeys';
import { notification } from 'antd';
import { useOfflineStatus, offlineStatusManager } from '@/core/offline/sync/status';
import { getOfflineRepos } from '@/core/offline/db/repos';
import type { PatientFilters } from './patientFilters';
import { deserializeUrl } from '@/features/filters/ast/url-format';
import { serialize as serializeInternal } from '@/features/filters/ast/serialize';
import { evaluate } from '@/features/filters/ast/evaluator';

/**
 * Rows fetched per page from SQLite.
 * Chosen at 100 so the first viewport loads fast and the next page is
 * pre-fetched before the user scrolls past row ~80.
 */
export const PATIENTS_PAGE_SIZE = 100;

/** True when any field that narrows the result set is set (sort-only is not a filter). */
function hasActiveDataFilters(filters: PatientFilters): boolean {
  return !!(filters.status || filters.ward || filters.search || filters.filter);
}

// ─── Read — always SQLite ────────────────────────────────────────────────────

/**
 * Paginated patient list backed exclusively by the local SQLite replica.
 *
 * SQLite is the single source of truth after the initial bootstrap:
 *   1. usePatientBootstrap fills SQLite from the server on first load.
 *   2. useRealtimePatients keeps individual rows fresh via SSE/WS events.
 *   3. useSyncOnReconnect refreshes the whole replica after an offline gap.
 *
 * This hook never calls the server directly.  staleTime: Infinity prevents
 * TanStack Query from auto-refetching; callers invalidate on purpose.
 */
export function usePatients(
  tenantId: string,
  filters: PatientFilters = {},
  /** Server-reported total, provided by bootstrap so pagination works before the
   *  full dataset is written to SQLite. When present, `getNextPageParam` uses this
   *  instead of SQLite's COUNT(*) — which starts small and grows during background sync. */
  serverTotalHint?: number,
) {
  return useInfiniteQuery({
    queryKey: queryKeys.patients.list(tenantId, { ...filters, infinite: true }),
    enabled: !!tenantId,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { patientRepo } = await getOfflineRepos();
      let filterFn: ((p: Patient) => boolean) | undefined;
      if (filters.filter) {
        try {
          const ast = deserializeUrl(filters.filter);
          filterFn = (p) => evaluate(ast, p);
        } catch {
          // Malformed AST — proceed without in-memory filter
        }
      }
      const result = patientRepo.findFiltered(tenantId, filters, pageParam as number, PATIENTS_PAGE_SIZE, filterFn);

      // Server fallback: only for unfiltered queries where the background stream
      // hasn't written this page range to SQLite yet.
      // Gated on !hasActiveDataFilters so filter results always come exclusively
      // from SQLite — mixing server pages into a filtered view would return rows
      // that bypass the client-side filter logic and corrupt the result set.
      if (
        result.data.length === 0 &&
        !hasActiveDataFilters(filters) &&
        offlineStatusManager.status !== 'offline' &&
        serverTotalHint != null
      ) {
        const sqliteCount = patientRepo.countByTenant(tenantId);
        const expectedOffset = ((pageParam as number) - 1) * PATIENTS_PAGE_SIZE;
        // Only fall back when the requested offset is genuinely beyond what SQLite
        // has written — not when an unfiltered query legitimately has no more rows.
        if (expectedOffset >= sqliteCount && expectedOffset < serverTotalHint) {
          try {
            const serverResult = await apiFetch<PaginatedResult<Patient>>(
              buildServerPatientsUrl(tenantId, pageParam as number, PATIENTS_PAGE_SIZE, filters),
            );
            if (serverResult.data.length > 0) {
              // Seed SQLite so subsequent reads (and the post-stream invalidation) see this data.
              patientRepo.upsertMany(tenantId, serverResult.data);
              return serverResult;
            }
          } catch {
            // Server fetch failed — fall through and return the empty SQLite result.
          }
        }
      }

      return result;
    },
    getNextPageParam: (lastPage) => {
      // For filtered queries SQLite's own totalPages is authoritative — the filter
      // already limits the result set, so inflating it with the server total would
      // create phantom "next pages" that return empty results forever.
      if (hasActiveDataFilters(filters)) {
        return lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined;
      }
      // Unfiltered: use serverTotalHint so the user can paginate into ranges that
      // the background stream hasn't written to SQLite yet (server fallback above
      // handles fetching those pages directly from the server).
      const effectiveTotalPages = serverTotalHint
        ? Math.max(lastPage.totalPages, Math.ceil(serverTotalHint / PATIENTS_PAGE_SIZE))
        : lastPage.totalPages;
      return lastPage.page < effectiveTotalPages ? lastPage.page + 1 : undefined;
    },
    staleTime: Infinity,
    gcTime: 5 * 60 * 1_000,
    networkMode: 'always',
  });
}

// ─── Write — status mutation ─────────────────────────────────────────────────

export function useUpdatePatientStatus(tenantId: string) {
  const qc = useQueryClient();
  const offlineStatus = useOfflineStatus();

  return useMutation({
    mutationFn: async ({ patientId, status }: { patientId: string; status: Patient['status'] }) => {
      if (offlineStatus === 'offline') {
        // Queue the action; return the optimistic shape from the current cache.
        const { queueRepo } = await getOfflineRepos();
        queueRepo.enqueue({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          tenantId,
          entity: 'patient',
          entityId: patientId,
          op: 'update',
          payload: { status },
          createdAt: Date.now(),
        });
        const allCached = qc.getQueriesData<PaginatedResult<Patient>>({
          queryKey: queryKeys.patients.all(tenantId),
        });
        for (const [, data] of allCached) {
          const patient = data?.data.find((p) => p.id === patientId);
          if (patient) return { ...patient, status };
        }
        throw new Error('Patient not found in cache');
      }

      // Online path: send to server, write the confirmed result to SQLite.
      const updated = await apiFetch<Patient>(`/patients/${patientId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
        requiredCapability: 'editPatientStatus',
      });
      void getOfflineRepos().then(({ patientRepo }) => patientRepo.upsert(tenantId, updated));
      return updated;
    },

    // Optimistic: patch cache immediately so the UI responds before the round-trip.
    onMutate: async ({ patientId, status }) => {
      await qc.cancelQueries({ queryKey: queryKeys.patients.all(tenantId) });

      const snapshots = qc.getQueriesData<PaginatedResult<Patient>>({
        queryKey: queryKeys.patients.all(tenantId),
      });

      qc.setQueriesData<PaginatedResult<Patient>>(
        { queryKey: queryKeys.patients.all(tenantId) },
        (old) => {
          if (!old) return old;
          return { ...old, data: old.data.map((p) => (p.id === patientId ? { ...p, status } : p)) };
        },
      );

      // Also write the optimistic value to SQLite so that an immediate
      // cache invalidation re-reads the correct state.
      void getOfflineRepos().then(({ patientRepo }) => {
        const allCached = qc.getQueriesData<PaginatedResult<Patient>>({
          queryKey: queryKeys.patients.all(tenantId),
        });
        for (const [, data] of allCached) {
          const patient = data?.data.find((p) => p.id === patientId);
          if (patient) { patientRepo.upsert(tenantId, { ...patient, status }); break; }
        }
      });

      return { snapshots };
    },

    onError: (_err, _vars, context) => {
      for (const [key, data] of context?.snapshots ?? []) {
        qc.setQueryData(key, data);
      }
      notification.error({
        message: 'Failed to update patient status',
        description: 'The change has been reverted.',
      });
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.patients.all(tenantId) });
    },
  });
}

// ─── Export ──────────────────────────────────────────────────────────────────

/**
 * Fetches all patients matching current filters from the server (no pagination),
 * converts to XLSX, and triggers a browser download.
 */
export function useExportPatients(tenantId: string) {
  return useMutation({
    mutationFn: async (filters: PatientFilters) => {
      const qs = new URLSearchParams({ tenantId });

      if (filters.filter) {
        try {
          const node = deserializeUrl(filters.filter);
          qs.set('filterAst', serializeInternal(node));
        } catch {
          if (filters.status) qs.set('status', filters.status);
          if (filters.ward)   qs.set('ward',   filters.ward);
          if (filters.search) qs.set('search', filters.search);
        }
      } else {
        if (filters.status) qs.set('status', filters.status);
        if (filters.ward)   qs.set('ward',   filters.ward);
        if (filters.search) qs.set('search', filters.search);
      }
      if (filters.sort) qs.set('sort', filters.sort);

      const patients = await apiFetch<Patient[]>(`/patients/export?${qs}`, {
        requiredCapability: 'exportPatients',
      });

      const rows = patients.map((p) => ({
        MRN: p.mrn,
        'First Name': p.firstName,
        'Last Name': p.lastName,
        DOB: p.dob,
        Age: p.age,
        Sex: p.sex,
        Status: p.status,
        Ward: p.ward,
        'Heart Rate': p.heartRate ?? '',
        BP: p.bp ?? '',
        'Temp (°C)': p.temp ?? '',
        'SpO2 (%)': p.o2sat ?? '',
        'Admitted At': p.admittedAt,
        'Last Updated': p.updatedAt,
        Notes: p.notes ?? '',
      }));

      const ws = xlsxUtils.json_to_sheet(rows);
      const wb = xlsxUtils.book_new();
      xlsxUtils.book_append_sheet(wb, ws, 'Patients');
      const timestamp = new Date().toISOString().slice(0, 10);
      xlsxWriteFile(wb, `patients_export_${timestamp}.xlsx`);
    },
    onError: () => {
      notification.error({ message: 'Export failed', description: 'Could not download patient data. Please try again.' });
    },
  });
}

// ─── Server-side filter helper (used by bootstrap & sync, not by usePatients) ─

/**
 * Builds a URL for fetching patients from the server.
 * Used by usePatientBootstrap and useSyncOnReconnect — NOT by usePatients.
 */
export function buildServerPatientsUrl(
  tenantId: string,
  page: number,
  limit: number,
  filters: PatientFilters = {},
  since = 0,
): string {
  const qs = new URLSearchParams({
    tenantId,
    page: String(page),
    limit: String(limit),
  });
  // Only include `since` when > 0: the server uses a separate code path (findSince)
  // when this param is present, returning a plain array instead of a PaginatedResult.
  if (since > 0) qs.set('since', String(since));

  if (filters.filter) {
    try {
      const node = deserializeUrl(filters.filter);
      qs.set('filterAst', serializeInternal(node));
    } catch {
      if (filters.status) qs.set('status', filters.status);
      if (filters.ward)   qs.set('ward',   filters.ward);
      if (filters.search) qs.set('search', filters.search);
    }
  } else {
    if (filters.status) qs.set('status', filters.status);
    if (filters.ward)   qs.set('ward',   filters.ward);
    if (filters.search) qs.set('search', filters.search);
  }
  if (filters.sort) qs.set('sort', filters.sort);

  return `/patients?${qs}`;
}
