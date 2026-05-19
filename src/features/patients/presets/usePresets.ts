import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/core/api/client';
import { queryKeys } from '@/core/api/queryKeys';
import type { FilterPreset } from '@/shared/types';
import { notification } from 'antd';
import type { PresetConflict, ConflictResolution } from './PresetConflictModal';

export function usePresets(tenantId: string, userId: string) {
  return useQuery({
    queryKey: queryKeys.presets.all(tenantId, userId),
    queryFn: () => apiFetch<FilterPreset[]>('/presets'),
    enabled: !!tenantId && !!userId,
    staleTime: 30_000,
  });
}

export function useCreatePreset(tenantId: string, userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; filterAst: string; isShared: boolean }) =>
      apiFetch<FilterPreset>('/presets', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.presets.all(tenantId, userId) });
    },
    onError: () => {
      notification.error({ message: 'Failed to save preset' });
    },
  });
}

interface UpdatePresetPayload {
  id: string;
  name?: string;
  filterAst?: string;
  isShared?: boolean;
  version: number;
  /** When true, bypasses optimistic locking on the server (user explicitly chose to overwrite). */
  force?: boolean;
}

/**
 * Hook that manages preset updates and surfaces conflicts via a structured
 * ConflictResolution flow instead of a plain error notification.
 *
 * Usage:
 *   const { mutate, conflict, resolveConflict, dismissConflict } = useUpdatePreset(tenantId, userId);
 */
export function useUpdatePreset(tenantId: string, userId: string) {
  const qc = useQueryClient();
  const [conflict, setConflict] = useState<PresetConflict | null>(null);
  // Cache the pending payload so we can retry / resolve it
  const [pendingPayload, setPendingPayload] = useState<UpdatePresetPayload | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: UpdatePresetPayload) => {
      const { id, force, ...body } = payload;
      return apiFetch<FilterPreset>(`/presets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(force ? { ...body, force: true } : body),
      });
    },
    onSuccess: () => {
      setConflict(null);
      setPendingPayload(null);
      void qc.invalidateQueries({ queryKey: queryKeys.presets.all(tenantId, userId) });
    },
    onError: (err: unknown, variables) => {
      const apiErr = err as { status?: number; body?: unknown };
      if (apiErr.status === 409) {
        // Structured conflict — surface to UI rather than showing notification
        const body = apiErr.body as { serverPayload?: FilterPreset; serverVersion?: number } | undefined;
        if (body?.serverPayload) {
          setConflict({
            presetId: variables.id,
            localPayload: {
              name: variables.name ?? body.serverPayload.name,
              filterAst: variables.filterAst ?? body.serverPayload.filterAst,
              isShared: variables.isShared ?? body.serverPayload.isShared,
            },
            serverPayload: body.serverPayload,
          });
          setPendingPayload(variables);
          return;
        }
      }
      notification.error({ message: 'Failed to update preset' });
    },
  });

  const resolveConflict = (resolution: ConflictResolution) => {
    if (!conflict || !pendingPayload) return;

    switch (resolution.action) {
      case 'force_overwrite':
        // Re-send with force flag — server bypasses version check
        mutation.mutate({ ...pendingPayload, force: true });
        break;

      case 'accept_server':
        // Discard local changes — just invalidate so UI refreshes to server state
        setConflict(null);
        setPendingPayload(null);
        void qc.invalidateQueries({ queryKey: queryKeys.presets.all(tenantId, userId) });
        break;

      case 'save_as_new': {
        // Handled by caller creating a new preset — just dismiss the conflict
        setConflict(null);
        setPendingPayload(null);
        break;
      }
    }
  };

  const dismissConflict = () => {
    setConflict(null);
    setPendingPayload(null);
  };

  return {
    mutate: mutation.mutate,
    isPending: mutation.isPending,
    conflict,
    pendingPayload,
    resolveConflict,
    dismissConflict,
  };
}

export function useDeletePreset(tenantId: string, userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/presets/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.presets.all(tenantId, userId) });
    },
    onError: () => {
      notification.error({ message: 'Failed to delete preset' });
    },
  });
}
