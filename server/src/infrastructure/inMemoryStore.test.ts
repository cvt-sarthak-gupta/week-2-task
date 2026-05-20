import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStore } from './inMemoryStore';

interface TestEntity {
  id: string;
  name: string;
  updatedAt: string;
}

const make = (id: string, updatedAt = '2024-01-01T00:00:00.000Z'): TestEntity => ({
  id,
  name: `Entity ${id}`,
  updatedAt,
});

describe('InMemoryStore', () => {
  let store: InMemoryStore<TestEntity>;
  const T = 'tenant-a';

  beforeEach(() => { store = new InMemoryStore(); });

  describe('set / get', () => {
    it('stores and retrieves an entity', () => {
      const e = make('1');
      store.set(T, e);
      expect(store.get(T, '1')).toEqual(e);
    });

    it('returns null for unknown id', () => {
      expect(store.get(T, 'missing')).toBeNull();
    });

    it('overwrites an existing entity', () => {
      store.set(T, make('1', '2024-01-01'));
      const updated = make('1', '2024-06-01');
      store.set(T, updated);
      expect(store.get(T, '1')).toEqual(updated);
    });

    it('invalidates the sorted cache on set', () => {
      store.setMany(T, [make('1'), make('2')]);
      expect(store.getUpdatedAtDesc(T)).not.toBeNull();
      store.set(T, make('3'));
      expect(store.getUpdatedAtDesc(T)).toBeNull();
    });
  });

  describe('setMany / getUpdatedAtDesc', () => {
    it('builds a sorted cache from all tenant entities, not just the passed-in subset', () => {
      // First bulk load
      store.setMany(T, [make('1', '2024-01-01'), make('2', '2024-06-01'), make('3', '2024-03-01')]);
      const first = store.getUpdatedAtDesc(T)!;
      expect(first.map((e) => e.id)).toEqual(['2', '3', '1']);

      // Second bulk load with a single record — cache must include ALL three records
      store.setMany(T, [make('4', '2024-09-01')]);
      const second = store.getUpdatedAtDesc(T)!;
      expect(second).toHaveLength(4);
      expect(second[0]?.id).toBe('4'); // newest first
    });

    it('sorts correctly by updatedAt DESC', () => {
      store.setMany(T, [
        make('a', '2023-01-01'),
        make('b', '2024-12-31'),
        make('c', '2024-06-15'),
      ]);
      const sorted = store.getUpdatedAtDesc(T)!;
      expect(sorted.map((e) => e.id)).toEqual(['b', 'c', 'a']);
    });
  });

  describe('delete', () => {
    it('removes an entity and returns true', () => {
      store.set(T, make('1'));
      expect(store.delete(T, '1')).toBe(true);
      expect(store.get(T, '1')).toBeNull();
    });

    it('returns false for a non-existent id', () => {
      expect(store.delete(T, 'ghost')).toBe(false);
    });

    it('invalidates the sorted cache', () => {
      store.setMany(T, [make('1'), make('2')]);
      store.delete(T, '1');
      expect(store.getUpdatedAtDesc(T)).toBeNull();
    });
  });

  describe('count', () => {
    it('returns 0 for an empty tenant', () => {
      expect(store.count(T)).toBe(0);
    });

    it('reflects the current size after mutations', () => {
      store.set(T, make('1'));
      store.set(T, make('2'));
      expect(store.count(T)).toBe(2);
      store.delete(T, '1');
      expect(store.count(T)).toBe(1);
    });
  });

  describe('clear', () => {
    it('clears a specific tenant', () => {
      store.set('tenant-a', make('1'));
      store.set('tenant-b', make('2'));
      store.clear('tenant-a');
      expect(store.count('tenant-a')).toBe(0);
      expect(store.count('tenant-b')).toBe(1);
    });

    it('clears all tenants when called without argument', () => {
      store.set('tenant-a', make('1'));
      store.set('tenant-b', make('2'));
      store.clear();
      expect(store.count('tenant-a')).toBe(0);
      expect(store.count('tenant-b')).toBe(0);
    });
  });

  describe('tenant isolation', () => {
    it('does not leak entities between tenants', () => {
      store.set('tenant-a', make('shared-id'));
      expect(store.get('tenant-b', 'shared-id')).toBeNull();
      expect(store.getAll('tenant-b')).toHaveLength(0);
    });
  });
});
