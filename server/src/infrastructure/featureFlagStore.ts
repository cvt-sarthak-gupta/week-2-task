import fs from 'fs';
import path from 'path';

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

const PERSIST_PATH = path.resolve(process.cwd(), 'data', 'feature-flags.json');

function loadFromDisk(): Map<string, FeatureFlags> {
  try {
    const raw = fs.readFileSync(PERSIST_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, FeatureFlags>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map(Object.entries(INITIAL_FLAGS_BY_TENANT));
  }
}

function saveToDisk(map: Map<string, FeatureFlags>): void {
  try {
    const dir = path.dirname(PERSIST_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PERSIST_PATH, JSON.stringify(Object.fromEntries(map), null, 2), 'utf-8');
  } catch (err) {
    console.error('[featureFlagStore] Failed to persist flags to disk:', err);
  }
}

const store = loadFromDisk();

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
  saveToDisk(store);
  return updated;
}
