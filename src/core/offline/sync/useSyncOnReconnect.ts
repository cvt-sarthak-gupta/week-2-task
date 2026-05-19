import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { offlineStatusManager, type OfflineStatus } from './status';
import { runSync } from './orchestrator';
import { getOfflineRepos } from '../db/repos';
import { queryKeys } from '@/core/api/queryKeys';
import type { Patient, PaginatedResult } from '@/shared/types';
import type { SyncConflict } from '@/features/sync/ConflictModal';

export function useSyncOnReconnect(
  tenantId: string,
  onConflicts?: (conflicts: SyncConflict[]) => void,
): void {
  const qc = useQueryClient();
  const prevStatusRef = useRef<OfflineStatus>(offlineStatusManager.status);
  const onConflictsRef = useRef(onConflicts);
  onConflictsRef.current = onConflicts;

  useEffect(() => {
    if (!tenantId) return;

    const unsub = offlineStatusManager.subscribe((status) => {
      const wasOffline = prevStatusRef.current === 'offline';
      prevStatusRef.current = status;

      if (wasOffline && status === 'online') {
        void (async () => {
          const { db, patientRepo, queueRepo } = await getOfflineRepos();

          const syncResult = await runSync({
            tenantId,
            getLocalPatients: () => patientRepo.findAll(tenantId),
            getPendingQueue: () => queueRepo.getPending(tenantId),
            onPatientsUpdated: (patients) => {
              patientRepo.upsertMany(tenantId, patients);
              qc.setQueriesData<PaginatedResult<Patient>>(
                { queryKey: queryKeys.patients.all(tenantId) },
                (old) => (old ? { ...old, data: patients, total: patients.length } : old),
              );
            },
            onEntryConflict: (entry, meta) => queueRepo.markConflict(entry.id, meta),
            onEntrySynced: (id) => queueRepo.markSynced(id),
            getLastSyncAt: () => {
              const row = db.queryOne<{ last_sync_at: number }>(
                'SELECT last_sync_at FROM sync_meta WHERE tenant_id = ?',
                [tenantId],
              );
              return row?.last_sync_at ?? 0;
            },
            setLastSyncAt: (ts) => {
              db.run(
                'INSERT INTO sync_meta (tenant_id, last_sync_at) VALUES (?, ?) ON CONFLICT(tenant_id) DO UPDATE SET last_sync_at = excluded.last_sync_at',
                [tenantId, ts],
              );
            },
          });

          if (syncResult.conflicts.length > 0) {
            onConflictsRef.current?.(syncResult.conflicts);
          }
        })();
      }
    });

    return unsub;
  }, [tenantId, qc]);
}
