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

      const count = patientRepo.countByTenant(tenantId);
      if (count > 0) {
        startTransition(() => {
          qc.invalidateQueries({ queryKey: queryKeys.patients.all(tenantId) });
        });
      }

      if (count === 0 && offlineStatusManager.status !== 'offline') {
        dispatch({ type: 'VIEWPORT_START' });
        try {
          const firstPage = await apiFetch<PaginatedResult<Patient>>(
            buildServerPatientsUrl(tenantId, 1, 100, { sort: 'updatedAt:DESC' }),
          );

          if (cancelled) return;

          const data = firstPage.data;
          patientRepo.upsertMany(tenantId, data);

          dispatch({ type: 'SERVER_TOTAL', total: firstPage.total });

          if (data.length > 0) {
            const maxTs = Math.max(...data.map((p) => new Date(p.updatedAt).getTime()));
            db.run(
              'INSERT INTO sync_meta (tenant_id, last_sync_at) VALUES (?, ?) ON CONFLICT(tenant_id) DO UPDATE SET last_sync_at = excluded.last_sync_at',
              [tenantId, maxTs],
            );
          }

          startTransition(() => {
            qc.invalidateQueries({ queryKey: queryKeys.patients.all(tenantId) });
          });
        } catch (err) {
          console.error('[usePatientBootstrap] viewport prefetch failed:', err);
        }
      }

      if (cancelled) return;

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
