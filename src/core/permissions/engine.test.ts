import { describe, it, expect } from 'vitest';
import { can, isFeatureEnabled, canWithFlag } from './engine';
import type { PermissionSchema } from './schema';

const makeSchema = (
  capabilities: PermissionSchema['capabilities'] = [],
  flags: Partial<PermissionSchema['featureFlags']> = {},
): PermissionSchema => ({
  capabilities,
  featureFlags: {
    analyticsWidget: false,
    exportFeature: false,
    advancedFilters: false,
    offlineSupport: false,
    presetSharing: false,
    ...flags,
  },
  layout: { visibleColumns: [], sideWidgets: [], actionBar: [] },
});

describe('can', () => {
  it('returns true when capability is present', () => {
    const schema = makeSchema(['viewPatients', 'editPatientStatus']);
    expect(can(schema, 'viewPatients')).toBe(true);
    expect(can(schema, 'editPatientStatus')).toBe(true);
  });

  it('returns false when capability is absent', () => {
    const schema = makeSchema(['viewPatients']);
    expect(can(schema, 'editPatientStatus')).toBe(false);
  });

  it('returns false on empty capabilities', () => {
    expect(can(makeSchema(), 'viewPatients')).toBe(false);
  });
});

describe('isFeatureEnabled', () => {
  it('returns true when flag is on', () => {
    const schema = makeSchema([], { exportFeature: true });
    expect(isFeatureEnabled(schema, 'exportFeature')).toBe(true);
  });

  it('returns false when flag is off', () => {
    const schema = makeSchema([], { exportFeature: false });
    expect(isFeatureEnabled(schema, 'exportFeature')).toBe(false);
  });
});

describe('canWithFlag', () => {
  it('capability without flag dependency — just checks capability', () => {
    const schema = makeSchema(['viewPatients']);
    expect(canWithFlag(schema, 'viewPatients')).toBe(true);
  });

  it('flag-gated capability — requires both cap and flag', () => {
    // exportPatients requires exportFeature flag
    const capOnly = makeSchema(['exportPatients'], { exportFeature: false });
    expect(canWithFlag(capOnly, 'exportPatients')).toBe(false);

    const both = makeSchema(['exportPatients'], { exportFeature: true });
    expect(canWithFlag(both, 'exportPatients')).toBe(true);
  });

  it('flag on but no capability — returns false', () => {
    const flagOnly = makeSchema([], { exportFeature: true });
    expect(canWithFlag(flagOnly, 'exportPatients')).toBe(false);
  });

  it('viewAnalytics requires analyticsWidget flag', () => {
    const schema = makeSchema(['viewAnalytics'], { analyticsWidget: false });
    expect(canWithFlag(schema, 'viewAnalytics')).toBe(false);

    const schemaOn = makeSchema(['viewAnalytics'], { analyticsWidget: true });
    expect(canWithFlag(schemaOn, 'viewAnalytics')).toBe(true);
  });

  it('sharePresets requires presetSharing flag', () => {
    const schema = makeSchema(['sharePresets'], { presetSharing: false });
    expect(canWithFlag(schema, 'sharePresets')).toBe(false);

    const schemaOn = makeSchema(['sharePresets'], { presetSharing: true });
    expect(canWithFlag(schemaOn, 'sharePresets')).toBe(true);
  });

  it('managePresets requires advancedFilters flag', () => {
    const schema = makeSchema(['managePresets'], { advancedFilters: false });
    expect(canWithFlag(schema, 'managePresets')).toBe(false);

    const schemaOn = makeSchema(['managePresets'], { advancedFilters: true });
    expect(canWithFlag(schemaOn, 'managePresets')).toBe(true);
  });
});
