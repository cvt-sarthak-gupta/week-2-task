import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionService } from './permission.service';
import { setFlagsForTenant, getFlagsForTenant } from '../../infrastructure/featureFlagStore';

const TENANT = 'tenant-test';
const USER_ID = 'user-1';

function makeService() {
  return new PermissionService();
}

describe('PermissionService', () => {
  describe('getConfig', () => {
    it('returns capabilities and featureFlags for the tenant', () => {
      const service = makeService();
      const caps = ['viewPatients', 'editPatientStatus'];
      const config = service.getConfig(TENANT, USER_ID, 'coordinator', caps);

      expect(config.capabilities).toEqual(caps);
      expect(config.userId).toBe(USER_ID);
      expect(config.featureFlags).toBeDefined();
      expect(typeof config.featureFlags.exportFeature).toBe('boolean');
    });

    it('includes editStatus in actionBar when editPatientStatus capability is present', () => {
      const service = makeService();
      const config = service.getConfig(TENANT, USER_ID, 'coordinator', ['viewPatients', 'editPatientStatus']);
      expect(config.layout.actionBar).toContain('editStatus');
    });

    it('returns empty actionBar when editPatientStatus capability is absent', () => {
      const service = makeService();
      const config = service.getConfig(TENANT, USER_ID, 'coordinator', ['viewPatients']);
      expect(config.layout.actionBar).toHaveLength(0);
    });

    it('includes the five standard visible columns', () => {
      const service = makeService();
      const config = service.getConfig(TENANT, USER_ID, 'coordinator', []);
      const fields = config.layout.visibleColumns.map((c) => c.field);
      expect(fields).toContain('mrn');
      expect(fields).toContain('lastName');
      expect(fields).toContain('firstName');
      expect(fields).toContain('status');
      expect(fields).toContain('ward');
    });

    it('returns sideWidgets as an empty array', () => {
      const service = makeService();
      const config = service.getConfig(TENANT, USER_ID, 'coordinator', []);
      expect(config.layout.sideWidgets).toEqual([]);
    });
  });

  describe('updateFlags', () => {
    beforeEach(() => {
      // Reset to a known state before each test
      setFlagsForTenant(TENANT, {
        exportFeature: false,
        advancedFilters: false,
        presetSharing: true,
      });
    });

    it('updates a single flag and persists it', () => {
      const service = makeService();
      const result = service.updateFlags(TENANT, { exportFeature: true });
      expect(result.exportFeature).toBe(true);
      expect(getFlagsForTenant(TENANT).exportFeature).toBe(true);
    });

    it('partial update preserves unchanged flags', () => {
      const service = makeService();
      service.updateFlags(TENANT, { advancedFilters: true });
      const flags = getFlagsForTenant(TENANT);
      expect(flags.advancedFilters).toBe(true);
      expect(flags.presetSharing).toBe(true);  // unchanged
      expect(flags.exportFeature).toBe(false); // unchanged
    });

    it('can update multiple flags at once', () => {
      const service = makeService();
      const result = service.updateFlags(TENANT, { exportFeature: true, advancedFilters: true });
      expect(result.exportFeature).toBe(true);
      expect(result.advancedFilters).toBe(true);
    });

    it('returns the full updated FeatureFlags object', () => {
      const service = makeService();
      const result = service.updateFlags(TENANT, { presetSharing: false });
      expect(Object.keys(result)).toEqual(
        expect.arrayContaining(['exportFeature', 'advancedFilters', 'presetSharing']),
      );
    });
  });
});
