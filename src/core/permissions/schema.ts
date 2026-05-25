export type Capability =
  | 'viewPatients'
  | 'editPatientStatus'
  | 'editPatientNotes'
  | 'assignCoordinator'
  | 'dischargePatient'
  | 'exportPatients'
  | 'viewAlerts'
  | 'dismissAlerts'
  | 'managePresets'
  | 'sharePresets'
  | 'manageUsers'
  | 'viewAuditLog'
  | 'manageFeatureFlags';

export type FeatureFlagKey =
  | 'exportFeature'
  | 'advancedFilters'
  | 'presetSharing';

export interface PermissionSchema {
  readonly capabilities: readonly Capability[];
  readonly featureFlags: Readonly<Record<FeatureFlagKey, boolean>>;
  readonly layout: LayoutSchema;
}

export interface ColumnVisibility {
  readonly field: string;
  readonly visible: boolean;
  readonly label: string;
}

export interface LayoutSchema {
  readonly visibleColumns: readonly ColumnVisibility[];
  readonly sideWidgets: readonly string[];
  readonly actionBar: readonly string[];
}

export const DEFAULT_PERMISSION_SCHEMA: PermissionSchema = {
  capabilities: ['viewPatients'],
  featureFlags: {
    exportFeature: false,
    advancedFilters: false,
    presetSharing: false,
  },
  layout: {
    visibleColumns: [],
    sideWidgets: [],
    actionBar: [],
  },
};
