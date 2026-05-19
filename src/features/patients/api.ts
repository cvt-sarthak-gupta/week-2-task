import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/core/api/client';
import type { Patient, PaginatedResult } from '@/shared/types';
import { queryKeys } from '@/core/api/queryKeys';
import { notification } from 'antd';
import { useOfflineStatus } from '@/core/offline/sync/status';
import { getOfflineRepos } from '@/core/offline/db/repos';
import type { PatientFilters } from './patientFilters';
import { deserializeUrl } from '@/features/filters/ast/url-format';
import { serialize as serializeInternal } from '@/features/filters/ast/serialize';

const PAGE_SIZE = 200;

export function usePatients(tenantId: string, filters: PatientFilters = {}) {
  const offlineStatus = useOfflineStatus();
  const isOffline = offlineStatus === 'offline';

  return useInfiniteQuery({
    // isOffline is intentionally NOT in the key — switching offline/online must not
    // bust the cache and cause a blank-grid flash. The queryFn reads isOffline at
    // call time and routes to SQLite or the API transparently.
    queryKey: queryKeys.patients.list(tenantId, { ...filters, infinite: true }),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      if (isOffline) {
        const { patientRepo } = await getOfflineRepos();
        return patientRepo.findFiltered(tenantId, filters, pageParam as number, PAGE_SIZE);
      }
      const qs = new URLSearchParams({ tenantId, page: String(pageParam), limit: String(PAGE_SIZE) });
      if (filters.filter) {
        // Convert the human-readable URL format to internal format for the server evaluator
        try {
          const node = deserializeUrl(filters.filter);
          qs.set('filterAst', serializeInternal(node));
        } catch {
          // Malformed filter — fall back to flat params
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
      const result = await apiFetch<PaginatedResult<Patient>>(`/patients?${qs}`);
      void getOfflineRepos().then(({ patientRepo }) => patientRepo.upsertMany(tenantId, result.data));
      return result;
    },
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    staleTime: 30_000,
    networkMode: 'always',
  });
}

export function useUpdatePatientStatus(tenantId: string) {
  const qc = useQueryClient();
  const offlineStatus = useOfflineStatus();

  return useMutation({
    mutationFn: async ({ patientId, status }: { patientId: string; status: Patient['status'] }) => {
      if (offlineStatus === 'offline') {
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
        // Return updated patient from cache so optimistic update has correct shape
        const allCached = qc.getQueriesData<PaginatedResult<Patient>>({
          queryKey: queryKeys.patients.all(tenantId),
        });
        for (const [, data] of allCached) {
          const patient = data?.data.find((p) => p.id === patientId);
          if (patient) return { ...patient, status };
        }
        throw new Error('Patient not found in cache');
      }
      return apiFetch<Patient>(`/patients/${patientId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    },

    onMutate: async ({ patientId, status }) => {
      await qc.cancelQueries({ queryKey: queryKeys.patients.all(tenantId) });

      // Snapshot ALL list queries under this tenant (filters vary, so use the prefix key)
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

      return { snapshots };
    },

    onError: (_err, _vars, context) => {
      for (const [key, data] of context?.snapshots ?? []) {
        qc.setQueryData(key, data);
      }
      notification.error({ message: 'Failed to update patient status', description: 'The change has been reverted.' });
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.patients.all(tenantId) });
    },
  });
}
