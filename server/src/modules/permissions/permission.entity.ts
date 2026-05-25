import type { FeatureFlags } from '../../infrastructure/featureFlagStore';

export interface LayoutColumnConfig {
  field: string;
  label: string;
  visible: boolean;
}

export interface LayoutConfig {
  visibleColumns: LayoutColumnConfig[];
  sideWidgets: string[];
  actionBar: string[];
}

export interface PermissionConfig {
  capabilities: string[];
  featureFlags: FeatureFlags;
  layout: LayoutConfig;
  userId: string;
}
