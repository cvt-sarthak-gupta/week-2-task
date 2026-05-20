import { useReducer, useEffect, useRef, startTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getOfflineRepos } from '../db/repos';
import { apiFetch } from '@/core/api/client';
import { getAccessToken } from '@/core/api/tokens';
import { queryKeys } from '@/core/api/queryKeys';
import { offlineStatusManager } from './status';
import { buildServerPatientsUrl } from '@/features/patients/api';
import { streamBootstrap } from './streamBootstrap';
import type { Patient, PaginatedResult } from '@/shared/types';

export type BootstrapPhase = 'idle' | 'viewport' | 'streaming' | 'complete' | 'error';

export interface BootstrapState {
  phase: BootstrapPhase;
  received: number;
  /** Server-reported total row count, available as soon as the viewport fetch returns. */
  serverTotal?: number;
  error?: Error;
}

type BootstrapAction =
  | { type: 'VIEWPORT_START' }
  | { type: 'STREAM_START' }
  | { type: 'BATCH'; received: number }
  | { type: 'SERVER_TOTAL'; total: number }
  | { type: 'COMPLETE' }
  | { type: 'ERROR'; error: Error };

const initialState: BootstrapState = { phase: 'idle', received: 0 };

function bootstrapReducer(state: BootstrapState, action: BootstrapAction): BootstrapState {
  switch (action.type) {
    case 'VIEWPORT_START':
      return { ...state, phase: 'viewport' };
    case 'STREAM_START':
      return { ...state, phase: 'streaming' };
    case 'BATCH':
      return { ...state, received: action.received };
    case 'SERVER_TOTAL':
      return { ...state, serverTotal: action.total };
    case 'COMPLETE':
      return { ...state, phase: 'complete' };
    case 'ERROR':
      return { ...state, phase: 'error', error: action.error };
    default:
      return state;
  }
}

export function usePatientBootstrap(tenantId: string): BootstrapState {
  const [state, dispatch] = useReducer(bootstrapReducer, initialState);
  const qc = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);
  const idleCallbackRef = useRef<number | null>(null);

  useEffect(() => {
    if (!tenantId) return;

    let cancelled = false;

    async function run(): Promise<void> {
      const { db, patientRepo } = await getOfflineRepos();

      if (cancelled) return;

      // Phase 0: existing data — invalidate once so the grid reads from SQLite immediately.
      const count = patientRepo.countByTenant(tenantId);
      if (count > 0) {
        startTransition(() => {
          qc.invalidateQueries({ queryKey: queryKeys.patients.all(tenantId) });
        });
      }

      // Phase 1: viewport fetch — first 100 rows for immediate display.
      // Only runs when SQLite is empty (first visit or cleared storage).
      if (count === 0 && offlineStatusManager.status !== 'offline') {
        dispatch({ type: 'VIEWPORT_START' });
        try {
          const firstPage = await apiFetch<PaginatedResult<Patient>>(
            buildServerPatientsUrl(tenantId, 1, 100, { sort: 'updatedAt:DESC' }),
          );

          if (cancelled) return;

          const data = firstPage.data;
          patientRepo.upsertMany(tenantId, data);

          // Tell the rest of the app how many records exist on the server so the
          // grid can size its scroll container and pagination correctly from the start,
          // without waiting for the full background stream to complete.
          dispatch({ type: 'SERVER_TOTAL', total: firstPage.total });

          if (data.length > 0) {
            const maxTs = Math.max(...data.map((p) => new Date(p.updatedAt).getTime()));
            db.run(
              'INSERT INTO sync_meta (tenant_id, last_sync_at) VALUES (?, ?) ON CONFLICT(tenant_id) DO UPDATE SET last_sync_at = excluded.last_sync_at',
              [tenantId, maxTs],
            );
          }

          // One invalidation to show the viewport rows — this is the only visible update.
          startTransition(() => {
            qc.invalidateQueries({ queryKey: queryKeys.patients.all(tenantId) });
          });
        } catch {
          // Non-fatal — continue to stream phase
        }
      }

      if (cancelled) return;

      // Phase 2: background stream — silently fills SQLite with all remaining records.
      // No per-batch invalidation: the grid never sees data "popping in" mid-stream.
      // One final invalidation fires when the stream completes so pagination and totals
      // reflect the full dataset.
      if (count === 0) {
        async function kickoffStream(): Promise<void> {
          if (offlineStatusManager.status === 'offline') return;

          dispatch({ type: 'STREAM_START' });

          const abortController = new AbortController();
          abortRef.current = abortController;

          const token = getAccessToken();
          let received = 0;

          try {
            await streamBootstrap({
              url: `/api/patients/stream?tenantId=${encodeURIComponent(tenantId)}`,
              ...(token && { headers: { Authorization: `Bearer ${token}` } }),
              signal: abortController.signal,
              // Large batch size: flush SQLite every 500 rows to keep write bursts small
              // while still achieving a single HTTP connection for all 50k records.
              batchSize: 500,
              onBatch: (batch) => {
                patientRepo.upsertMany(tenantId, batch);
                received += batch.length;
                dispatch({ type: 'BATCH', received });
              },
              onCheckpoint: (lastUpdatedAt) => {
                db.run(
                  'INSERT INTO sync_meta (tenant_id, last_sync_at) VALUES (?, ?) ON CONFLICT(tenant_id) DO UPDATE SET last_sync_at = excluded.last_sync_at',
                  [tenantId, lastUpdatedAt],
                );
              },
            });

            if (!cancelled) {
              dispatch({ type: 'COMPLETE' });
              // Single invalidation after the full dataset is in SQLite.
              // Refreshes pagination totals and any skeleton rows the user may have scrolled into.
              startTransition(() => {
                qc.invalidateQueries({ queryKey: queryKeys.patients.all(tenantId) });
              });
            }
          } catch (err) {
            if ((err as Error).name === 'AbortError') return;
            if (!cancelled) {
              dispatch({ type: 'ERROR', error: err instanceof Error ? err : new Error(String(err)) });
            }
          }
        }

        if (typeof requestIdleCallback !== 'undefined') {
          idleCallbackRef.current = requestIdleCallback(() => {
            void kickoffStream();
          }, { timeout: 2000 });
        } else {
          idleCallbackRef.current = setTimeout(() => {
            void kickoffStream();
          }, 0) as unknown as number;
        }
      } else {
        // Returning user — SQLite already has data; delta updates come from useSyncOnReconnect.
        if (!cancelled) dispatch({ type: 'COMPLETE' });
      }
    }

    void run();

    return () => {
      cancelled = true;
      abortRef.current?.abort();

      if (idleCallbackRef.current !== null) {
        if (typeof cancelIdleCallback !== 'undefined') {
          cancelIdleCallback(idleCallbackRef.current);
        } else {
          clearTimeout(idleCallbackRef.current);
        }
        idleCallbackRef.current = null;
      }
    };
  }, [tenantId, qc]);

  return state;
}
