import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notification } from 'antd';
import { apiFetch } from '@/core/api/client';
import { queryKeys } from '@/core/api/queryKeys';
import type { FeatureFlagKey } from '@/core/permissions/schema';

type UpdateFeatureFlagsDto = { [K in FeatureFlagKey]?: boolean };
interface UpdateFeatureFlagsResponse {
  featureFlags: Record<FeatureFlagKey, boolean>;
}

export function useUpdateFeatureFlags(userId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (dto: UpdateFeatureFlagsDto) =>
      apiFetch<UpdateFeatureFlagsResponse>('/admin/feature-flags', {
        method: 'PATCH',
        body: JSON.stringify(dto),
        requiredCapability: 'manageFeatureFlags',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.permissions.config(userId) });
      notification.success({ message: 'Feature flag updated — changes are live for all users in this tenant.' });
    },
    onError: () => {
      notification.error({ message: 'Failed to update feature flag' });
    },
  });
}
