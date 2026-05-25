import type { FeatureFlags } from '../../infrastructure/featureFlagStore';
import type { ColumnConfig } from '../../infrastructure/columnVisibilityStore';
import type { PermissionConfig } from './permission.entity';

export interface GetConfigResponse {
  version: string;
  config: PermissionConfig;
}

export interface UpdateFeatureFlagsDto {
  exportFeature?: boolean | undefined;
  advancedFilters?: boolean | undefined;
  presetSharing?: boolean | undefined;
}

export interface UpdateFeatureFlagsResponse {
  featureFlags: FeatureFlags;
}

export interface UpdateColumnVisibilityDto {
  role: string;
  columns: Record<string, boolean>;
}

export interface UpdateColumnVisibilityResponse {
  visibleColumns: ColumnConfig[];
}
