import type { Capability, FeatureFlagKey, PermissionSchema } from './schema';

/** Pure capability evaluator — no React, no side effects. */
export function can(schema: PermissionSchema, capability: Capability): boolean {
  return schema.capabilities.includes(capability);
}

export function isFeatureEnabled(schema: PermissionSchema, flag: FeatureFlagKey): boolean {
  return schema.featureFlags[flag] === true;
}

/** A user needs the capability AND the flag (if a flag guards this cap). */
const CAPABILITY_FLAG_MAP: Partial<Record<Capability, FeatureFlagKey>> = {
  exportPatients: 'exportFeature',
  viewAnalytics: 'analyticsWidget',
  sharePresets: 'presetSharing',
  managePresets: 'advancedFilters',
};

export function canWithFlag(schema: PermissionSchema, capability: Capability): boolean {
  if (!can(schema, capability)) return false;
  const flag = CAPABILITY_FLAG_MAP[capability];
  if (flag === undefined) return true;
  return isFeatureEnabled(schema, flag);
}
