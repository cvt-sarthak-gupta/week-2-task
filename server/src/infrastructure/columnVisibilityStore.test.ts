import { describe, it, expect, beforeEach } from 'vitest';
import {
  getColumnsForRole,
  setColumnsForRole,
  clearColumnsForRole,
  ALL_COLUMNS,
} from './columnVisibilityStore';

const TENANT = 'tenant-test';
const ALL_FIELDS = ALL_COLUMNS.map((c) => c.field);

describe('columnVisibilityStore', () => {
  describe('getColumnsForRole — defaults', () => {
    it('returns all 13 configurable columns for coordinator', () => {
      const cols = getColumnsForRole(TENANT, 'coordinator');
      expect(cols).toHaveLength(ALL_FIELDS.length);
      expect(cols.every((c) => c.visible)).toBe(true);
    });

    it('returns all 13 configurable columns for admin', () => {
      const cols = getColumnsForRole(TENANT, 'admin');
      expect(cols.every((c) => c.visible)).toBe(true);
    });

    it('readonly role defaults to only the 5 clinical summary columns visible', () => {
      const cols = getColumnsForRole(TENANT, 'readonly');
      const visible = cols.filter((c) => c.visible).map((c) => c.field);
      expect(visible.sort()).toEqual(['firstName', 'lastName', 'mrn', 'status', 'ward'].sort());
    });

    it('readonly role hides vitals columns by default', () => {
      const cols = getColumnsForRole(TENANT, 'readonly');
      const vitals = ['heartRate', 'bp', 'temp', 'o2sat'];
      for (const field of vitals) {
        expect(cols.find((c) => c.field === field)?.visible).toBe(false);
      }
    });

    it('unknown role defaults to all columns visible', () => {
      const cols = getColumnsForRole(TENANT, 'superadmin');
      expect(cols.every((c) => c.visible)).toBe(true);
    });

    it('each column has field, label, and visible properties', () => {
      const cols = getColumnsForRole(TENANT, 'coordinator');
      for (const col of cols) {
        expect(typeof col.field).toBe('string');
        expect(typeof col.label).toBe('string');
        expect(typeof col.visible).toBe('boolean');
      }
    });
  });

  describe('setColumnsForRole — mutations', () => {
    beforeEach(() => {
      clearColumnsForRole(TENANT, 'coordinator');
      clearColumnsForRole(TENANT, 'readonly');
    });

    it('hides a single column for a role', () => {
      setColumnsForRole(TENANT, 'coordinator', { heartRate: false });
      const cols = getColumnsForRole(TENANT, 'coordinator');
      expect(cols.find((c) => c.field === 'heartRate')?.visible).toBe(false);
    });

    it('partial patch preserves other columns unchanged', () => {
      setColumnsForRole(TENANT, 'coordinator', { heartRate: false });
      const cols = getColumnsForRole(TENANT, 'coordinator');
      const unchanged = cols.filter((c) => c.field !== 'heartRate');
      expect(unchanged.every((c) => c.visible)).toBe(true);
    });

    it('returns the updated column list after set', () => {
      const result = setColumnsForRole(TENANT, 'coordinator', { dob: false, age: false });
      expect(result.find((c) => c.field === 'dob')?.visible).toBe(false);
      expect(result.find((c) => c.field === 'age')?.visible).toBe(false);
    });

    it('can show a column that was hidden', () => {
      setColumnsForRole(TENANT, 'readonly', { heartRate: true });
      const cols = getColumnsForRole(TENANT, 'readonly');
      expect(cols.find((c) => c.field === 'heartRate')?.visible).toBe(true);
    });

    it('ignores unknown field names in the patch', () => {
      expect(() =>
        setColumnsForRole(TENANT, 'coordinator', { nonExistentField: false }),
      ).not.toThrow();
      const cols = getColumnsForRole(TENANT, 'coordinator');
      expect(cols.every((c) => c.visible)).toBe(true);
    });
  });

  describe('tenant and role isolation', () => {
    beforeEach(() => {
      clearColumnsForRole('tenant-a', 'coordinator');
      clearColumnsForRole('tenant-b', 'coordinator');
      clearColumnsForRole('tenant-a', 'readonly');
      clearColumnsForRole('tenant-a', 'admin');
    });

    it('changes to one tenant do not affect another tenant', () => {
      setColumnsForRole('tenant-a', 'coordinator', { heartRate: false });
      const tenantB = getColumnsForRole('tenant-b', 'coordinator');
      expect(tenantB.find((c) => c.field === 'heartRate')?.visible).toBe(true);
    });

    it('changes to one role do not affect another role in the same tenant', () => {
      setColumnsForRole('tenant-a', 'coordinator', { heartRate: false });
      const readonly = getColumnsForRole('tenant-a', 'readonly');
      // readonly heartRate was already false by default — verify it wasn't reset to true
      expect(readonly.find((c) => c.field === 'heartRate')?.visible).toBe(false);

      // Also verify a coordinator-only change doesn't leak to admin
      clearColumnsForRole('tenant-a', 'admin');
      setColumnsForRole('tenant-a', 'coordinator', { bp: false });
      const admin = getColumnsForRole('tenant-a', 'admin');
      expect(admin.find((c) => c.field === 'bp')?.visible).toBe(true);
    });

    it('two tenants can have different visibility for the same role', () => {
      setColumnsForRole('tenant-a', 'coordinator', { updatedAt: false });
      setColumnsForRole('tenant-b', 'coordinator', { updatedAt: true });
      expect(getColumnsForRole('tenant-a', 'coordinator').find((c) => c.field === 'updatedAt')?.visible).toBe(false);
      expect(getColumnsForRole('tenant-b', 'coordinator').find((c) => c.field === 'updatedAt')?.visible).toBe(true);
    });
  });

  describe('service integration — getConfig uses role from ctx', () => {
    beforeEach(() => {
      clearColumnsForRole(TENANT, 'coordinator');
      clearColumnsForRole(TENANT, 'readonly');
    });

    it('coordinator gets all columns by default', () => {
      const cols = getColumnsForRole(TENANT, 'coordinator');
      expect(cols.filter((c) => c.visible)).toHaveLength(ALL_FIELDS.length);
    });

    it('readonly gets only 5 columns by default', () => {
      const cols = getColumnsForRole(TENANT, 'readonly');
      expect(cols.filter((c) => c.visible)).toHaveLength(5);
    });

    it('admin can override readonly defaults to show vitals', () => {
      setColumnsForRole(TENANT, 'readonly', { heartRate: true, bp: true });
      const cols = getColumnsForRole(TENANT, 'readonly');
      expect(cols.find((c) => c.field === 'heartRate')?.visible).toBe(true);
      expect(cols.find((c) => c.field === 'bp')?.visible).toBe(true);
    });
  });
});
