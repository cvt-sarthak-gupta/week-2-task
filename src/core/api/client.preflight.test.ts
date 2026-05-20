import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiFetch, setActivePermissionSchema, CapabilityDeniedError } from './client';
import type { PermissionSchema } from '../permissions/schema';

const makeSchema = (
  caps: PermissionSchema['capabilities'],
  flags: Partial<PermissionSchema['featureFlags']> = {},
): PermissionSchema => ({
  capabilities: caps,
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

function mockFetchOk(body: unknown = {}): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  ));
}

describe('apiFetch — client-side pre-flight capability checks', () => {
  beforeEach(() => {
    setActivePermissionSchema(null);
    vi.unstubAllGlobals();
  });

  it('throws CapabilityDeniedError when capability is absent from schema', async () => {
    setActivePermissionSchema(makeSchema(['viewPatients']));
    await expect(
      apiFetch('/patients/1', { method: 'PATCH', requiredCapability: 'editPatientStatus' }),
    ).rejects.toThrow(CapabilityDeniedError);
  });

  it('throws CapabilityDeniedError when flag-gated capability lacks its flag', async () => {
    setActivePermissionSchema(makeSchema(['exportPatients'], { exportFeature: false }));
    await expect(
      apiFetch('/patients/export', { requiredCapability: 'exportPatients' }),
    ).rejects.toThrow(CapabilityDeniedError);
  });

  it('throws for all flag-gated capabilities when flags are off', async () => {
    const schema = makeSchema(
      ['viewAnalytics', 'sharePresets', 'managePresets'],
      { analyticsWidget: false, presetSharing: false, advancedFilters: false },
    );
    setActivePermissionSchema(schema);

    await expect(apiFetch('/analytics', { requiredCapability: 'viewAnalytics' })).rejects.toThrow(CapabilityDeniedError);
    await expect(apiFetch('/presets/share', { requiredCapability: 'sharePresets' })).rejects.toThrow(CapabilityDeniedError);
    await expect(apiFetch('/presets', { requiredCapability: 'managePresets' })).rejects.toThrow(CapabilityDeniedError);
  });

  it('proceeds to fetch when capability is present and unflagged', async () => {
    setActivePermissionSchema(makeSchema(['viewPatients']));
    mockFetchOk({ data: [] });
    await expect(apiFetch('/patients', { requiredCapability: 'viewPatients' })).resolves.toBeDefined();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('proceeds to fetch when flag-gated capability has both cap and flag', async () => {
    setActivePermissionSchema(makeSchema(['exportPatients'], { exportFeature: true }));
    mockFetchOk({ url: 'presigned' });
    await expect(apiFetch('/patients/export', { requiredCapability: 'exportPatients' })).resolves.toBeDefined();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('proceeds when no requiredCapability is specified (unrestricted call)', async () => {
    setActivePermissionSchema(makeSchema([]));
    mockFetchOk({});
    await expect(apiFetch('/me/config')).resolves.toBeDefined();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('skips pre-flight when schema is not yet loaded (pre-login calls)', async () => {
    // _activeSchema is null — do not block calls before the schema is available
    mockFetchOk({});
    await expect(apiFetch('/auth/login', { requiredCapability: 'viewPatients' })).resolves.toBeDefined();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('CapabilityDeniedError carries the correct capability name', async () => {
    setActivePermissionSchema(makeSchema([]));
    try {
      await apiFetch('/patients/1', { method: 'DELETE', requiredCapability: 'dischargePatient' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CapabilityDeniedError);
      expect((err as CapabilityDeniedError).capability).toBe('dischargePatient');
    }
  });
});
