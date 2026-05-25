import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notification } from 'antd';
import { apiFetch } from '@/core/api/client';
import { queryKeys } from '@/core/api/queryKeys';
import type { ColumnVisibility } from '@/core/permissions/schema';

interface UpdateColumnVisibilityDto {
  role: string;
  columns: Record<string, boolean>;
}

interface UpdateColumnVisibilityResponse {
  visibleColumns: ColumnVisibility[];
}

export function useUpdateColumnVisibility(userId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (dto: UpdateColumnVisibilityDto) =>
      apiFetch<UpdateColumnVisibilityResponse>('/admin/layout/columns', {
        method: 'PATCH',
        body: JSON.stringify(dto),
        requiredCapability: 'manageFeatureFlags',
      }),

    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: queryKeys.permissions.config(userId) });
      notification.success({ message: `Column layout updated for ${variables.role} role` });
    },

    onError: () => {
      notification.error({ message: 'Failed to update column layout' });
    },
  });
}
