import { describe, it, expect, beforeEach } from 'vitest';
import { PresetService } from './preset.service';
import { InMemoryStore } from '../../infrastructure/inMemoryStore';
import type { PresetEntity } from './preset.entity';

const TENANT = 'tenant-a';
const OWNER = 'user-1';
const OTHER = 'user-2';

function makeStore() {
  return new InMemoryStore<PresetEntity>();
}

function makeService(store = makeStore()) {
  return { service: new PresetService(store), store };
}

describe('PresetService', () => {
  describe('create', () => {
    it('creates a preset and stores it', () => {
      const { service, store } = makeService();
      const p = service.create({ name: 'My Filter', filterAst: 'eq(status,critical)', isShared: false, tenantId: TENANT, userId: OWNER });
      expect(store.get(TENANT, p.id)).toEqual(p);
      expect(p.version).toBe(1);
    });

    it('throws ValidationError when name is empty', () => {
      const { service } = makeService();
      expect(() => service.create({ name: '', filterAst: 'eq(status,critical)', isShared: false, tenantId: TENANT, userId: OWNER }))
        .toThrow('name and filterAst are required');
    });

    it('throws ValidationError when filterAst is empty', () => {
      const { service } = makeService();
      expect(() => service.create({ name: 'X', filterAst: '', isShared: false, tenantId: TENANT, userId: OWNER }))
        .toThrow('name and filterAst are required');
    });
  });

  describe('listForUser', () => {
    it('returns own presets and shared presets, but not others private presets', () => {
      const { service } = makeService();
      const mine    = service.create({ name: 'mine',    filterAst: 'x', isShared: false, tenantId: TENANT, userId: OWNER });
      const shared  = service.create({ name: 'shared',  filterAst: 'x', isShared: true,  tenantId: TENANT, userId: OTHER });
      const theirs  = service.create({ name: 'theirs',  filterAst: 'x', isShared: false, tenantId: TENANT, userId: OTHER });

      const visible = service.listForUser(TENANT, OWNER);
      const ids = visible.map((p) => p.id);
      expect(ids).toContain(mine.id);
      expect(ids).toContain(shared.id);
      expect(ids).not.toContain(theirs.id);
    });
  });

  describe('update', () => {
    it('increments version on successful update', () => {
      const { service } = makeService();
      const p = service.create({ name: 'P', filterAst: 'x', isShared: false, tenantId: TENANT, userId: OWNER });
      const updated = service.update(TENANT, OWNER, p.id, { name: 'P2', version: 1 });
      expect(updated.version).toBe(2);
      expect(updated.name).toBe('P2');
    });

    it('throws ConflictError on version mismatch', () => {
      const { service } = makeService();
      const p = service.create({ name: 'P', filterAst: 'x', isShared: false, tenantId: TENANT, userId: OWNER });
      expect(() => service.update(TENANT, OWNER, p.id, { name: 'P2', version: 99 }))
        .toThrow('Preset was modified');
    });

    it('bypasses version check when force=true', () => {
      const { service } = makeService();
      const p = service.create({ name: 'P', filterAst: 'x', isShared: false, tenantId: TENANT, userId: OWNER });
      const updated = service.update(TENANT, OWNER, p.id, { name: 'Forced', version: 99, force: true });
      expect(updated.name).toBe('Forced');
    });

    it('throws ForbiddenError when non-owner edits private preset', () => {
      const { service } = makeService();
      const p = service.create({ name: 'P', filterAst: 'x', isShared: false, tenantId: TENANT, userId: OWNER });
      expect(() => service.update(TENANT, OTHER, p.id, { name: 'Hack', version: 1 }))
        .toThrow('permission');
    });

    it('allows non-owner to edit a shared preset', () => {
      const { service } = makeService();
      const p = service.create({ name: 'Shared', filterAst: 'x', isShared: true, tenantId: TENANT, userId: OWNER });
      const updated = service.update(TENANT, OTHER, p.id, { name: 'Edited', version: 1 });
      expect(updated.name).toBe('Edited');
    });

    it('throws NotFoundError for missing preset', () => {
      const { service } = makeService();
      expect(() => service.update(TENANT, OWNER, 'ghost', { name: 'X', version: 1 }))
        .toThrow('not found');
    });
  });

  describe('delete', () => {
    it('removes the preset', () => {
      const { service, store } = makeService();
      const p = service.create({ name: 'P', filterAst: 'x', isShared: false, tenantId: TENANT, userId: OWNER });
      service.delete(TENANT, OWNER, p.id);
      expect(store.get(TENANT, p.id)).toBeNull();
    });

    it('throws ForbiddenError when non-owner deletes', () => {
      const { service } = makeService();
      const p = service.create({ name: 'P', filterAst: 'x', isShared: true, tenantId: TENANT, userId: OWNER });
      expect(() => service.delete(TENANT, OTHER, p.id)).toThrow('Only the owner');
    });

    it('throws NotFoundError for missing preset', () => {
      const { service } = makeService();
      expect(() => service.delete(TENANT, OWNER, 'ghost')).toThrow('not found');
    });
  });
});
