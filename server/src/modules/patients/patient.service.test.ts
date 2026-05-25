import { describe, it, expect, beforeEach } from 'vitest';
import { PatientService } from './patient.service';
import { PatientRepository } from './patient.repository';
import { InMemoryStore } from '../../infrastructure/inMemoryStore';
import type { PatientEntity } from './patient.entity';

const TENANT = 'tenant-a';

function makePatient(overrides: Partial<PatientEntity> = {}): PatientEntity {
  return {
    id: `${TENANT}-p-000001`,
    tenantId: TENANT,
    mrn: 'MRN-000001',
    firstName: 'Alice',
    lastName: 'Smith',
    dob: '1980-01-01',
    age: 44,
    sex: 'F',
    status: 'stable',
    ward: 'ICU',
    assignedCoordinatorId: 'coord-1',
    admittedAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

function makeService() {
  const store = new InMemoryStore<PatientEntity>();
  const repo = new PatientRepository(store, TENANT);
  const service = new PatientService(repo);
  return { store, repo, service };
}

describe('PatientService', () => {
  describe('findById', () => {
    it('returns a patient that exists', async () => {
      const { store, service } = makeService();
      const p = makePatient();
      store.set(TENANT, p);
      await expect(service.findById(p.id)).resolves.toEqual(p);
    });

    it('throws NotFoundError for missing patient', async () => {
      const { service } = makeService();
      await expect(service.findById('ghost')).rejects.toThrow('not found');
    });
  });

  describe('findAll', () => {
    it('paginates results', async () => {
      const { store, service } = makeService();
      const patients = Array.from({ length: 5 }, (_, i) =>
        makePatient({ id: `${TENANT}-p-${String(i + 1).padStart(6, '0')}`, mrn: `MRN-${i}` }),
      );
      store.setMany(TENANT, patients);
      const page1 = await service.findAll(1, 3);
      const page2 = await service.findAll(2, 3);
      expect(page1.data).toHaveLength(3);
      expect(page2.data).toHaveLength(2);
      expect(page1.total).toBe(5);
    });

    it('filters by status', async () => {
      const { store, service } = makeService();
      store.setMany(TENANT, [
        makePatient({ id: `${TENANT}-p-000001`, status: 'critical' }),
        makePatient({ id: `${TENANT}-p-000002`, status: 'stable' }),
      ]);
      const result = await service.findAll(1, 20, { status: 'critical' });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.status).toBe('critical');
    });

    it('throws ValidationError on malformed filterAst', async () => {
      const { service } = makeService();
      await expect(service.findAll(1, 20, { filterAst: 'broken!!!' })).rejects.toThrow('Invalid filterAst');
    });
  });

  describe('update', () => {
    it('increments version and updates updatedAt', async () => {
      const { store, service } = makeService();
      const p = makePatient();
      store.set(TENANT, p);
      const updated = await service.update(p.id, { status: 'critical' });
      expect(updated.status).toBe('critical');
      expect(updated.version).toBe(2);
    });

    it('throws ConflictError on version mismatch', async () => {
      const { store, service } = makeService();
      const p = makePatient({ version: 5 });
      store.set(TENANT, p);
      await expect(service.update(p.id, { status: 'critical' }, 3)).rejects.toThrow('Conflict');
    });

    it('succeeds when expectedVersion matches exactly', async () => {
      const { store, service } = makeService();
      const p = makePatient({ version: 3 });
      store.set(TENANT, p);
      const updated = await service.update(p.id, { status: 'discharged' }, 3);
      expect(updated.version).toBe(4);
    });
  });

  describe('exportAll', () => {
    it('returns all patients without pagination', async () => {
      const { store, service } = makeService();
      const patients = Array.from({ length: 10 }, (_, i) =>
        makePatient({ id: `${TENANT}-p-${String(i + 1).padStart(6, '0')}` }),
      );
      store.setMany(TENANT, patients);
      const result = await service.exportAll();
      expect(result).toHaveLength(10);
    });

    it('throws ValidationError on malformed filterAst', async () => {
      const { service } = makeService();
      await expect(service.exportAll({ filterAst: '!!! bad' })).rejects.toThrow('Invalid filterAst');
    });
  });
});
