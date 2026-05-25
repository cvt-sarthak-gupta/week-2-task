import { describe, it, expect } from 'vitest';
import { PermissionHelper } from './permission.helper';

describe('PermissionHelper', () => {
  describe('buildVisibleColumns', () => {
    it('returns exactly 5 columns', () => {
      expect(PermissionHelper.buildVisibleColumns()).toHaveLength(5);
    });

    it('includes all required fields', () => {
      const fields = PermissionHelper.buildVisibleColumns().map((c) => c.field);
      expect(fields).toContain('mrn');
      expect(fields).toContain('lastName');
      expect(fields).toContain('firstName');
      expect(fields).toContain('status');
      expect(fields).toContain('ward');
    });

    it('all columns are marked visible: true', () => {
      for (const col of PermissionHelper.buildVisibleColumns()) {
        expect(col.visible).toBe(true);
      }
    });

    it('each column has a non-empty label', () => {
      for (const col of PermissionHelper.buildVisibleColumns()) {
        expect(col.label.length).toBeGreaterThan(0);
      }
    });

    it('returns columns in mrn → lastName → firstName → status → ward order', () => {
      const fields = PermissionHelper.buildVisibleColumns().map((c) => c.field);
      expect(fields).toEqual(['mrn', 'lastName', 'firstName', 'status', 'ward']);
    });

    it('returns a new array on each call (no shared reference)', () => {
      const a = PermissionHelper.buildVisibleColumns();
      const b = PermissionHelper.buildVisibleColumns();
      expect(a).not.toBe(b);
    });
  });

  describe('buildActionBar', () => {
    it('returns empty array when capabilities is empty', () => {
      expect(PermissionHelper.buildActionBar([])).toHaveLength(0);
    });

    it('returns empty array when unrelated capabilities are present', () => {
      expect(PermissionHelper.buildActionBar(['viewPatients', 'viewAlerts', 'manageFeatureFlags'])).toHaveLength(0);
    });

    it('includes editStatus when editPatientStatus capability is present', () => {
      expect(PermissionHelper.buildActionBar(['editPatientStatus'])).toContain('editStatus');
    });

    it('includes editStatus mixed among other capabilities', () => {
      const bar = PermissionHelper.buildActionBar(['viewPatients', 'editPatientStatus', 'viewAlerts']);
      expect(bar).toContain('editStatus');
    });

    it('does not duplicate editStatus when capability appears multiple times', () => {
      const bar = PermissionHelper.buildActionBar(['editPatientStatus', 'editPatientStatus']);
      expect(bar.filter((a) => a === 'editStatus')).toHaveLength(1);
    });

    it('returns a new array on each call', () => {
      const a = PermissionHelper.buildActionBar([]);
      const b = PermissionHelper.buildActionBar([]);
      expect(a).not.toBe(b);
    });
  });
});
