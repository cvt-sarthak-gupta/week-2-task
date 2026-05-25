export interface FeatureFlags {
  exportFeature: boolean;
  advancedFilters: boolean;
  presetSharing: boolean;
}

const DEFAULTS: FeatureFlags = {
  exportFeature: false,
  advancedFilters: false,
  presetSharing: true,
};

const INITIAL_FLAGS_BY_TENANT: Record<string, FeatureFlags> = {
  'tenant-a': { exportFeature: true,  advancedFilters: true, presetSharing: true },
  'tenant-b': { exportFeature: false, advancedFilters: true, presetSharing: true },
  'tenant-c': { exportFeature: true,  advancedFilters: true, presetSharing: true },
};

const store = new Map<string, FeatureFlags>(
  Object.entries(INITIAL_FLAGS_BY_TENANT),
);

export function getFlagsForTenant(tenantId: string): FeatureFlags {
  return store.get(tenantId) ?? { ...DEFAULTS };
}

export function setFlagsForTenant(tenantId: string, patch: { [K in keyof FeatureFlags]?: boolean | undefined }): FeatureFlags {
  const current = getFlagsForTenant(tenantId);
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as Partial<FeatureFlags>;
  const updated: FeatureFlags = { ...current, ...defined };
  store.set(tenantId, updated);
  return updated;
}
