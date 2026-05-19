import { apiFetch } from '@/core/api/client';
import { offlineStatusManager } from './status';
import { computeDiff, applyDiff } from './diff';
import type { Patient } from '@/shared/types';
import type { QueueEntry, ConflictMeta } from '../queue/types';

export interface SyncResult {
  updatedPatients: Patient[];
  conflicts: Array<{ entry: QueueEntry; meta: ConflictMeta }>;
}

export interface SyncDependencies {
  tenantId: string;
  getLocalPatients: () => Patient[];
  getPendingQueue: () => QueueEntry[];
  onPatientsUpdated: (patients: Patient[]) => void;
  onEntryConflict: (entry: QueueEntry, meta: ConflictMeta) => void;
  onEntrySynced: (id: string) => void;
  getLastSyncAt: () => number;
  setLastSyncAt: (ts: number) => void;
}

let syncInProgress = false;

export async function runSync(deps: SyncDependencies): Promise<SyncResult> {
  if (syncInProgress) return { updatedPatients: [], conflicts: [] };
  syncInProgress = true;
  offlineStatusManager.setSyncing();

  const conflicts: SyncResult['conflicts'] = [];

  try {
    // 1. Fetch server state since last sync
    const since = deps.getLastSyncAt();
    const serverPatients = await apiFetch<Patient[]>(`/patients?since=${since}&tenantId=${deps.tenantId}`);

    // 2. Compute diff and apply minimal updates
    const local = deps.getLocalPatients();
    const diff = computeDiff(local, serverPatients);
    const updated = applyDiff(local, diff);
    deps.onPatientsUpdated(updated);

    // 3. Replay offline queue in order
    const queue = deps.getPendingQueue();
    for (const entry of queue) {
      try {
        await apiFetch(`/${entry.entity}s/${entry.entityId}`, {
          method: entry.op === 'delete' ? 'DELETE' : entry.op === 'create' ? 'POST' : 'PATCH',
          body: JSON.stringify(entry.payload),
        });
        deps.onEntrySynced(entry.id);
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 409) {
          const meta = (err as { body?: { serverVersion: number; serverPayload: unknown } }).body;
          if (meta) {
            const conflictMeta: ConflictMeta = { serverVersion: meta.serverVersion, serverPayload: meta.serverPayload };
            deps.onEntryConflict(entry, conflictMeta);
            conflicts.push({ entry, meta: conflictMeta });
          }
        }
        // Other errors: leave in queue for next sync
      }
    }

    deps.setLastSyncAt(Date.now());
    return { updatedPatients: updated, conflicts };
  } finally {
    syncInProgress = false;
  }
}
