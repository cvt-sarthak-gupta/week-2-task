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
      expect(results[0].id).toBe('p-1');
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
});
