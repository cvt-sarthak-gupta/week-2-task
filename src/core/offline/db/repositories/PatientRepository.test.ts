import { describe, it, expect, beforeEach } from 'vitest';
import { PatientRepository } from './PatientRepository';
import { makeInMemoryDb } from '@/core/testing/makeDbClient';
import type { Patient } from '@/shared/types';

function makePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'p-1',
    tenantId: 't-1',
    mrn: 'MRN001',
    firstName: 'Alice',
    lastName: 'Smith',
    dob: '1985-04-12',
    age: 39,
    sex: 'F',
    status: 'stable',
    ward: 'ICU',
    assignedCoordinatorId: 'coord-1',
    admittedAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    version: 1,
    ...overrides,
  };
}

describe('PatientRepository', () => {
  let repo: PatientRepository;

  beforeEach(() => {
    repo = new PatientRepository(makeInMemoryDb());
  });

  describe('upsert', () => {
    it('inserts a new patient', () => {
      const p = makePatient();
      repo.upsert('t-1', p);
      expect(repo.findById('t-1', 'p-1')).toMatchObject({ id: 'p-1', firstName: 'Alice' });
    });

    it('updates when incoming version is higher', () => {
      repo.upsert('t-1', makePatient({ version: 1, status: 'stable' }));
      repo.upsert('t-1', makePatient({ version: 2, status: 'critical' }));
      expect(repo.findById('t-1', 'p-1')?.status).toBe('critical');
    });

    it('does NOT overwrite when incoming version is lower', () => {
      repo.upsert('t-1', makePatient({ version: 5, status: 'critical' }));
      repo.upsert('t-1', makePatient({ version: 3, status: 'stable' }));
      expect(repo.findById('t-1', 'p-1')?.status).toBe('critical');
    });

    it('allows same version to overwrite (idempotent replay)', () => {
      repo.upsert('t-1', makePatient({ version: 2, notes: 'first' }));
      repo.upsert('t-1', makePatient({ version: 2, notes: 'second' }));
      // version >= condition: same version overwrites
      expect(repo.findById('t-1', 'p-1')?.notes).toBe('second');
    });
  });

  describe('upsertMany', () => {
    it('inserts all patients', () => {
      repo.upsertMany('t-1', [
        makePatient({ id: 'p-1' }),
        makePatient({ id: 'p-2' }),
        makePatient({ id: 'p-3' }),
      ]);
      expect(repo.findAll('t-1')).toHaveLength(3);
    });
  });

  describe('findById', () => {
    it('returns null for unknown id', () => {
      expect(repo.findById('t-1', 'no-such-id')).toBeNull();
    });

    it('is tenant-isolated', () => {
      repo.upsert('t-1', makePatient({ id: 'p-1' }));
      expect(repo.findById('t-2', 'p-1')).toBeNull();
    });
  });

  describe('findAll', () => {
    it('returns empty array when no patients', () => {
      expect(repo.findAll('t-1')).toEqual([]);
    });

    it('returns only patients for the given tenant', () => {
      repo.upsert('t-1', makePatient({ id: 'p-1' }));
      repo.upsert('t-2', makePatient({ id: 'p-2' }));
      const results = repo.findAll('t-1');
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('p-1');
    });
  });

  describe('findByStatus', () => {
    it('filters by status correctly', () => {
      repo.upsert('t-1', makePatient({ id: 'p-1', status: 'critical' }));
      repo.upsert('t-1', makePatient({ id: 'p-2', status: 'stable' }));
      repo.upsert('t-1', makePatient({ id: 'p-3', status: 'critical' }));
      const critical = repo.findByStatus('t-1', 'critical');
      expect(critical).toHaveLength(2);
      expect(critical.every((p) => p.status === 'critical')).toBe(true);
    });
  });

  describe('findFiltered', () => {
    beforeEach(() => {
      repo.upsertMany('t-1', [
        makePatient({ id: 'p-1', mrn: 'MRN001', status: 'critical',   ward: 'ICU',     firstName: 'Alice', lastName: 'Smith' }),
        makePatient({ id: 'p-2', mrn: 'MRN002', status: 'stable',     ward: 'ICU',     firstName: 'Bob',   lastName: 'Jones' }),
        makePatient({ id: 'p-3', mrn: 'MRN003', status: 'critical',   ward: 'General', firstName: 'Carol', lastName: 'Brown' }),
        makePatient({ id: 'p-4', mrn: 'MRN004', status: 'discharged', ward: 'General', firstName: 'Dave',  lastName: 'Miller' }),
      ]);
    });

    it('returns all rows with empty filters', () => {
      const result = repo.findFiltered('t-1', {});
      expect(result.total).toBe(4);
      expect(result.data).toHaveLength(4);
    });

    it('filters by status', () => {
      const result = repo.findFiltered('t-1', { status: 'critical' });
      expect(result.total).toBe(2);
      expect(result.data.every((p) => p.status === 'critical')).toBe(true);
    });

    it('filters by ward', () => {
      const result = repo.findFiltered('t-1', { ward: 'ICU' });
      expect(result.total).toBe(2);
      expect(result.data.every((p) => p.ward === 'ICU')).toBe(true);
    });

    it('filters by search (firstName match, case-insensitive)', () => {
      const result = repo.findFiltered('t-1', { search: 'alice' });
      expect(result.total).toBe(1);
      expect(result.data[0]?.firstName).toBe('Alice');
    });

    it('filters by search (lastName match)', () => {
      const result = repo.findFiltered('t-1', { search: 'jones' });
      expect(result.total).toBe(1);
      expect(result.data[0]?.id).toBe('p-2');
    });

    it('filters by search (mrn match)', () => {
      const result = repo.findFiltered('t-1', { search: 'MRN001' });
      expect(result.total).toBe(1);
    });

    it('combines status and ward filters', () => {
      const result = repo.findFiltered('t-1', { status: 'critical', ward: 'ICU' });
      expect(result.total).toBe(1);
      expect(result.data[0]?.id).toBe('p-1');
    });

    it('no matches returns empty result with correct pagination metadata', () => {
      const result = repo.findFiltered('t-1', { status: 'pending' });
      expect(result.total).toBe(0);
      expect(result.data).toHaveLength(0);
      expect(result.totalPages).toBe(1);
    });

    it('paginates correctly', () => {
      const page1 = repo.findFiltered('t-1', {}, 1, 2);
      const page2 = repo.findFiltered('t-1', {}, 2, 2);
      expect(page1.data).toHaveLength(2);
      expect(page2.data).toHaveLength(2);
      expect(page1.totalPages).toBe(2);
      // No row appears in both pages
      const ids1 = page1.data.map((p) => p.id);
      const ids2 = page2.data.map((p) => p.id);
      expect(ids1.some((id) => ids2.includes(id))).toBe(false);
    });

    it('sorts by a string field ASC', () => {
      const result = repo.findFiltered('t-1', { sort: 'firstName:ASC' });
      const names = result.data.map((p) => p.firstName);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });

    it('sorts by a string field DESC', () => {
      const result = repo.findFiltered('t-1', { sort: 'firstName:DESC' });
      const names = result.data.map((p) => p.firstName);
      expect(names).toEqual([...names].sort((a, b) => b.localeCompare(a)));
    });

    it('is tenant-isolated', () => {
      repo.upsert('t-2', makePatient({ id: 'p-other', status: 'critical' }));
      const result = repo.findFiltered('t-1', { status: 'critical' });
      expect(result.data.every((p) => p.tenantId !== 't-2')).toBe(true);
    });
  });

  describe('countByTenant', () => {
    it('returns 0 for empty tenant', () => {
      expect(repo.countByTenant('t-empty')).toBe(0);
    });

    it('counts all inserted patients for the tenant', () => {
      repo.upsertMany('t-1', [
        makePatient({ id: 'p-1' }),
        makePatient({ id: 'p-2' }),
        makePatient({ id: 'p-3' }),
      ]);
      expect(repo.countByTenant('t-1')).toBe(3);
    });

    it('is tenant-isolated', () => {
      repo.upsert('t-1', makePatient({ id: 'p-1' }));
      repo.upsert('t-2', makePatient({ id: 'p-2' }));
      expect(repo.countByTenant('t-1')).toBe(1);
      expect(repo.countByTenant('t-2')).toBe(1);
    });

    it('does not double-count an upserted patient', () => {
      repo.upsert('t-1', makePatient({ id: 'p-1', version: 1 }));
      repo.upsert('t-1', makePatient({ id: 'p-1', version: 2 }));
      expect(repo.countByTenant('t-1')).toBe(1);
    });

    it('updates count after delete', () => {
      repo.upsert('t-1', makePatient({ id: 'p-1' }));
      repo.upsert('t-1', makePatient({ id: 'p-2' }));
      repo.delete('t-1', 'p-1');
      expect(repo.countByTenant('t-1')).toBe(1);
    });
  });
});
