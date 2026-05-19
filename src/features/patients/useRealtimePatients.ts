import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { streamWorkerClient } from '@/core/workers/StreamWorkerClient';
import { queryKeys } from '@/core/api/queryKeys';
import { getOfflineRepos } from '@/core/offline/db/repos';
import type { Patient, PaginatedResult } from '@/shared/types';
import type { PatientUpdate } from '@/core/workers/protocol';

// After this many ms of silence from the event stream, re-fetch so the
// server-sorted order (updatedAt DESC) reflects recent in-place patches.
const REFETCH_DEBOUNCE_MS = 2_000;

/**
 * Subscribes to processed patient updates from the stream worker.
 * Patches the TanStack Query cache in-place (no re-fetch) and persists
 * each updated record to the offline SQLite store.
 *
 * A debounced invalidation fires after bursts settle so the server-side
 * sort order stays consistent without flooding the API.
 */
export function useRealtimePatients(tenantId: string): void {
  const qc = useQueryClient();
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!tenantId) return;

    function scheduleRefetch(): void {
      if (refetchTimerRef.current !== null) clearTimeout(refetchTimerRef.current);
      refetchTimerRef.current = setTimeout(() => {
        refetchTimerRef.current = null;
        void qc.invalidateQueries({ queryKey: queryKeys.patients.all(tenantId) });
      }, REFETCH_DEBOUNCE_MS);
    }

    function patchCache(id: string, patch: Partial<Patient>): Patient | null {
      let patched: Patient | null = null;
      qc.setQueriesData<InfiniteData<PaginatedResult<Patient>>>(
        { queryKey: queryKeys.patients.all(tenantId) },
        (old) => {
          if (!old) return old;
          let changed = false;
          const newPages = old.pages.map((page) => {
            if (!page.data.some((p) => p.id === id)) return page;
            changed = true;
            const updated = page.data.map((p) => {
              if (p.id !== id) return p;
              patched = { ...p, ...patch, version: Math.max(p.version, patch.version ?? 0) };
              return patched;
            });
            return { ...page, data: updated };
          });
          return changed ? { ...old, pages: newPages } : old;
        },
      );
      return patched;
    }

    const unsubBatch = streamWorkerClient.onBatch((updates: readonly PatientUpdate[]) => {
      let anyPatched = false;
      for (const { id, patch } of updates) {
        const updated = patchCache(id, patch);
        if (updated) {
          anyPatched = true;
          void getOfflineRepos().then(({ patientRepo }) => patientRepo.upsert(tenantId, updated));
        }
      }
      // Even when a batch only contains patients not yet in the cache, reschedule
      // a refetch so newly-updated records rise to the top of the sorted view.
      if (updates.length > 0 || anyPatched) scheduleRefetch();
    });

    return () => {
      unsubBatch();
      if (refetchTimerRef.current !== null) {
        clearTimeout(refetchTimerRef.current);
        refetchTimerRef.current = null;
      }
    };
  }, [tenantId, qc]);
}
