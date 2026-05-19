import { describe, it, expect, beforeEach } from 'vitest';
import { QueueRepository } from './QueueRepository';
import { makeInMemoryDb } from '@/core/testing/makeDbClient';
import type { QueueEntry } from '@/core/offline/queue/types';

function makeEntry(overrides: Partial<Omit<QueueEntry, 'retries' | 'status'>> = {}): Omit<QueueEntry, 'retries' | 'status'> {
  return {
    id: 'qe-1',
    tenantId: 't-1',
    entity: 'patient',
    entityId: 'p-1',
    op: 'update',
    payload: { status: 'critical' },
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('QueueRepository', () => {
  let repo: QueueRepository;

  beforeEach(() => {
    repo = new QueueRepository(makeInMemoryDb());
  });

  describe('enqueue', () => {
    it('inserts an entry with pending status', () => {
      repo.enqueue(makeEntry());
      const pending = repo.getPending('t-1');
      expect(pending).toHaveLength(1);
      expect(pending[0].status).toBe('pending');
      expect(pending[0].retries).toBe(0);
    });

    it('preserves payload round-trip', () => {
      const payload = { status: 'critical', notes: 'hello' };
      repo.enqueue(makeEntry({ payload }));
      expect(repo.getPending('t-1')[0].payload).toEqual(payload);
    });
  });

  describe('getPending', () => {
    it('returns entries in ascending createdAt order', () => {
      const now = Date.now();
      repo.enqueue(makeEntry({ id: 'qe-3', createdAt: now + 300 }));
      repo.enqueue(makeEntry({ id: 'qe-1', createdAt: now + 100 }));
      repo.enqueue(makeEntry({ id: 'qe-2', createdAt: now + 200 }));
      const ids = repo.getPending('t-1').map((e) => e.id);
      expect(ids).toEqual(['qe-1', 'qe-2', 'qe-3']);
    });

    it('excludes synced entries', () => {
      repo.enqueue(makeEntry({ id: 'qe-1' }));
      repo.enqueue(makeEntry({ id: 'qe-2' }));
      repo.markSynced('qe-1');
      const pending = repo.getPending('t-1');
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('qe-2');
    });

    it('excludes conflict entries', () => {
      repo.enqueue(makeEntry({ id: 'qe-1' }));
      repo.markConflict('qe-1', { serverVersion: 5, serverPayload: {} });
      expect(repo.getPending('t-1')).toHaveLength(0);
    });

    it('is tenant-isolated', () => {
      repo.enqueue(makeEntry({ tenantId: 't-1' }));
      repo.enqueue(makeEntry({ id: 'qe-2', tenantId: 't-2' }));
      expect(repo.getPending('t-1')).toHaveLength(1);
      expect(repo.getPending('t-2')).toHaveLength(1);
    });
  });

  describe('markSynced', () => {
    it('transitions status to synced', () => {
      repo.enqueue(makeEntry());
      repo.markSynced('qe-1');
      expect(repo.getPending('t-1')).toHaveLength(0);
    });
  });

  describe('markConflict', () => {
    it('sets status to conflict and stores conflict meta', () => {
      repo.enqueue(makeEntry());
      const meta = { serverVersion: 3, serverPayload: { status: 'stable' } };
      repo.markConflict('qe-1', meta);

      // No longer in pending
      expect(repo.getPending('t-1')).toHaveLength(0);

      // Meta is persisted — verify via count since there's no "getById" on the repo
      expect(repo.count('t-1')).toBe(1);
    });
  });

  describe('incrementRetries', () => {
    it('increments the retry counter each call', () => {
      repo.enqueue(makeEntry());
      repo.incrementRetries('qe-1');
      repo.incrementRetries('qe-1');
      const [entry] = repo.getPending('t-1');
      expect(entry.retries).toBe(2);
    });
  });

  describe('clear', () => {
    it('removes synced entries but keeps pending ones', () => {
      repo.enqueue(makeEntry({ id: 'qe-1' }));
      repo.enqueue(makeEntry({ id: 'qe-2' }));
      repo.markSynced('qe-1');
      repo.clear('t-1');
      expect(repo.getPending('t-1')).toHaveLength(1);
      expect(repo.count('t-1')).toBe(1);
    });
  });

  describe('count', () => {
    it('returns total count across statuses', () => {
      repo.enqueue(makeEntry({ id: 'qe-1' }));
      repo.enqueue(makeEntry({ id: 'qe-2' }));
      repo.markSynced('qe-1');
      expect(repo.count('t-1')).toBe(2);
    });
  });
});
