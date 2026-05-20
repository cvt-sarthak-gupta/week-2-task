import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { PermissionProvider, usePermissions } from './PermissionProvider';
import { useCan } from './useCan';
import type { PermissionSchema, Capability } from './schema';

// Mock the setActivePermissionSchema side-effect so tests don't have
// unintended coupling to the api/client module.
vi.mock('@/core/api/client', () => ({
  setActivePermissionSchema: vi.fn(),
}));

import { setActivePermissionSchema } from '@/core/api/client';
const mockSetActive = vi.mocked(setActivePermissionSchema);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ALL_FLAGS_OFF: PermissionSchema['featureFlags'] = {
  analyticsWidget: false,
  exportFeature: false,
  advancedFilters: false,
  offlineSupport: false,
  presetSharing: false,
};

const ALL_FLAGS_ON: PermissionSchema['featureFlags'] = {
  analyticsWidget: true,
  exportFeature: true,
  advancedFilters: true,
  offlineSupport: true,
  presetSharing: true,
};

function makeSchema(
  capabilities: PermissionSchema['capabilities'],
  flags: PermissionSchema['featureFlags'] = ALL_FLAGS_OFF,
): PermissionSchema {
  return {
    capabilities,
    featureFlags: flags,
    layout: { visibleColumns: [], sideWidgets: [], actionBar: [] },
  };
}

function wrapper(schema: PermissionSchema) {
  return ({ children }: { children: ReactNode }) => (
    <PermissionProvider schema={schema}>{children}</PermissionProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// usePermissions — schema exposure
// ---------------------------------------------------------------------------
describe('usePermissions — schema', () => {
  it('exposes the schema passed to the provider', () => {
    const schema = makeSchema(['viewPatients', 'editPatientStatus']);
    const { result } = renderHook(() => usePermissions(), { wrapper: wrapper(schema) });
    expect(result.current.schema).toBe(schema);
  });

  it('updates when the schema prop changes', () => {
    const schemaA = makeSchema(['viewPatients']);
    const schemaB = makeSchema(['viewPatients', 'editPatientStatus']);
    const { result, rerender } = renderHook(() => usePermissions(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <PermissionProvider schema={schemaA}>{children}</PermissionProvider>
      ),
    });
    expect(result.current.schema.capabilities).toContain('viewPatients');
    expect(result.current.schema.capabilities).not.toContain('editPatientStatus');

    // Re-render with a different schema via a wrapper component
    const { rerender: rerenderRoot } = render(
      <PermissionProvider schema={schemaA}>
        <span />
      </PermissionProvider>,
    );
    rerenderRoot(
      <PermissionProvider schema={schemaB}>
        <span />
      </PermissionProvider>,
    );
    // Verify that setActivePermissionSchema was called for both schemas
    expect(mockSetActive).toHaveBeenCalledWith(schemaA);
    expect(mockSetActive).toHaveBeenCalledWith(schemaB);
  });
});

// ---------------------------------------------------------------------------
// usePermissions — can() function
// ---------------------------------------------------------------------------
describe('usePermissions — can()', () => {
  it('returns true for a capability present in schema', () => {
    const schema = makeSchema(['viewPatients', 'editPatientStatus']);
    const { result } = renderHook(() => usePermissions(), { wrapper: wrapper(schema) });
    expect(result.current.can('viewPatients')).toBe(true);
    expect(result.current.can('editPatientStatus')).toBe(true);
  });

  it('returns false for a capability absent from schema', () => {
    const schema = makeSchema(['viewPatients']);
    const { result } = renderHook(() => usePermissions(), { wrapper: wrapper(schema) });
    expect(result.current.can('exportPatients')).toBe(false);
  });

  it('returns false for flag-gated capability when flag is off', () => {
    const schema = makeSchema(['exportPatients'], ALL_FLAGS_OFF);
    const { result } = renderHook(() => usePermissions(), { wrapper: wrapper(schema) });
    expect(result.current.can('exportPatients')).toBe(false);
  });

  it('returns true for flag-gated capability when both cap and flag are present', () => {
    const schema = makeSchema(['exportPatients'], { ...ALL_FLAGS_OFF, exportFeature: true });
    const { result } = renderHook(() => usePermissions(), { wrapper: wrapper(schema) });
    expect(result.current.can('exportPatients')).toBe(true);
  });

  it('all flag-gated capabilities work correctly', () => {
    const flagGated: Array<[Capability, keyof PermissionSchema['featureFlags']]> = [
      ['exportPatients', 'exportFeature'],
      ['viewAnalytics', 'analyticsWidget'],
      ['sharePresets', 'presetSharing'],
      ['managePresets', 'advancedFilters'],
    ];
    for (const [cap, flagKey] of flagGated) {
      const flagsOn = { ...ALL_FLAGS_OFF, [flagKey]: true };
      const schema = makeSchema([cap], flagsOn);
      const { result } = renderHook(() => usePermissions(), { wrapper: wrapper(schema) });
      expect(result.current.can(cap)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// useCan — thin hook over usePermissions
// ---------------------------------------------------------------------------
describe('useCan', () => {
  it('returns true when user has the capability', () => {
    const schema = makeSchema(['editPatientStatus']);
    const { result } = renderHook(() => useCan('editPatientStatus'), { wrapper: wrapper(schema) });
    expect(result.current).toBe(true);
  });

  it('returns false when user lacks the capability', () => {
    const schema = makeSchema([]);
    const { result } = renderHook(() => useCan('dischargePatient'), { wrapper: wrapper(schema) });
    expect(result.current).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setActivePermissionSchema side-effect
// ---------------------------------------------------------------------------
describe('PermissionProvider — setActivePermissionSchema side-effect', () => {
  it('calls setActivePermissionSchema with the schema on mount', () => {
    const schema = makeSchema(['viewPatients']);
    render(<PermissionProvider schema={schema}><span /></PermissionProvider>);
    expect(mockSetActive).toHaveBeenCalledWith(schema);
  });

  it('calls setActivePermissionSchema(null) on unmount', () => {
    const schema = makeSchema(['viewPatients']);
    const { unmount } = render(<PermissionProvider schema={schema}><span /></PermissionProvider>);
    unmount();
    expect(mockSetActive).toHaveBeenCalledWith(null);
  });

  it('calls setActivePermissionSchema with new schema when prop changes', () => {
    const schemaA = makeSchema(['viewPatients']);
    const schemaB = makeSchema(['viewPatients', 'editPatientStatus']);
    const { rerender } = render(<PermissionProvider schema={schemaA}><span /></PermissionProvider>);
    rerender(<PermissionProvider schema={schemaB}><span /></PermissionProvider>);
    expect(mockSetActive).toHaveBeenCalledWith(schemaB);
  });
});

// ---------------------------------------------------------------------------
// Default context (no provider)
// ---------------------------------------------------------------------------
describe('usePermissions — default context (outside provider)', () => {
  it('default can() always returns false', () => {
    // Accessing context outside a provider uses the default value
    const { result } = renderHook(() => usePermissions());
    expect(result.current.can('viewPatients')).toBe(false);
    expect(result.current.can('editPatientStatus')).toBe(false);
  });
});
