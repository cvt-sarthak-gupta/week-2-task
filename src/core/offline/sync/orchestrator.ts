import { apiFetch } from '@/core/api/client';
import { getAccessToken } from '@/core/api/tokens';
import { offlineStatusManager } from './status';
import { streamBootstrap } from './streamBootstrap';
import { computeDiff, applyDiff } from './diff';
import type { Patient } from '@/shared/types';
import type { QueueEntry, ConflictMeta } from '../queue/types';

export interface SyncResult {
  updatedPatients: Patient[];
  conflicts: Array<{ entry: QueueEntry; meta: ConflictMeta }>;
}

const MAX_QUEUE_RETRIES = 5;

export interface SyncDependencies {
  tenantId: string;
  getLocalPatients: () => Patient[];
  getPendingQueue: () => QueueEntry[];
  onPatientsUpdated: (patients: Patient[]) => void;
  onEntryConflict: (entry: QueueEntry, meta: ConflictMeta) => void;
  onEntrySynced: (id: string) => void;
  onEntryRetried?: (id: string) => void;
  getLastSyncAt: () => number;
  setLastSyncAt: (ts: number) => void;
}

const syncInProgress = new Map<string, boolean>();

export async function runSync(deps: SyncDependencies): Promise<SyncResult> {
  if (syncInProgress.get(deps.tenantId)) return { updatedPatients: [], conflicts: [] };
  syncInProgress.set(deps.tenantId, true);
  offlineStatusManager.setSyncing();

  const conflicts: SyncResult['conflicts'] = [];

  try {
    const since = deps.getLastSyncAt();
    const token = getAccessToken();
    const serverPatients: Patient[] = [];
    await streamBootstrap({
      url: `/api/patients/stream?since=${since}`,
      ...(token && { headers: { Authorization: `Bearer ${token}` } }),
      batchSize: 500,
      onBatch: (batch) => { serverPatients.push(...batch); },
      onCheckpoint: () => {},
    });

    const local = deps.getLocalPatients();
    const diff = computeDiff(local, serverPatients);
    const updated = applyDiff(local, diff);
    deps.onPatientsUpdated(updated);

    const queue = deps.getPendingQueue();
    for (const entry of queue) {
      if (entry.retries >= MAX_QUEUE_RETRIES) continue;
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
        } else {
          console.warn(`[sync] queue entry ${entry.id} failed (attempt ${entry.retries + 1}):`, err);
          deps.onEntryRetried?.(entry.id);
        }
      }
    }

    deps.setLastSyncAt(Date.now());
    return { updatedPatients: updated, conflicts };
  } finally {
    syncInProgress.set(deps.tenantId, false);
  }
}
