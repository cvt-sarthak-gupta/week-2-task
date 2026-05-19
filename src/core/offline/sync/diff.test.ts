import { describe, it, expect } from 'vitest';
import { computeDiff, applyDiff } from './diff';
import { makeMockPatient } from '@/core/testing/factories';

describe('computeDiff', () => {
  it('detects added rows', () => {
    const local = [makeMockPatient({ id: 'p1', version: 1 })];
    const server = [makeMockPatient({ id: 'p1', version: 1 }), makeMockPatient({ id: 'p2', version: 1 })];
    const diff = computeDiff(local, server);
    expect(diff).toHaveLength(1);
    expect(diff[0]?.type).toBe('add');
  });

  it('detects updated rows (higher server version)', () => {
    const p1 = makeMockPatient({ id: 'p1', version: 1 });
    const p1Updated = { ...p1, version: 2, status: 'critical' as const };
    const diff = computeDiff([p1], [p1Updated]);
    expect(diff).toHaveLength(1);
    expect(diff[0]?.type).toBe('update');
  });

  it('ignores rows with same or lower version', () => {
    const p1 = makeMockPatient({ id: 'p1', version: 5 });
    const p1Old = { ...p1, version: 3, status: 'stable' as const };
    const diff = computeDiff([p1], [p1Old]);
    expect(diff).toHaveLength(0); // local version is higher — no update
  });

  it('detects removed rows', () => {
    const p1 = makeMockPatient({ id: 'p1', version: 1 });
    const p2 = makeMockPatient({ id: 'p2', version: 1 });
    const diff = computeDiff([p1, p2], [p1]);
    expect(diff).toHaveLength(1);
    expect(diff[0]?.type).toBe('remove');
    expect((diff[0] as { type: 'remove'; id: string }).id).toBe('p2');
  });

  it('empty local + empty server = no diff', () => {
    expect(computeDiff([], [])).toHaveLength(0);
  });

  it('empty local + server data = all adds', () => {
    const server = [makeMockPatient({ id: 'p1' }), makeMockPatient({ id: 'p2' })];
    const diff = computeDiff([], server);
    expect(diff.every((d) => d.type === 'add')).toBe(true);
    expect(diff).toHaveLength(2);
  });

  it('local data + empty server = all removes', () => {
    const local = [makeMockPatient({ id: 'p1' }), makeMockPatient({ id: 'p2' })];
    const diff = computeDiff(local, []);
    expect(diff.every((d) => d.type === 'remove')).toBe(true);
    expect(diff).toHaveLength(2);
  });

  it('identical datasets = no diff', () => {
    const patients = [makeMockPatient({ id: 'p1', version: 1 }), makeMockPatient({ id: 'p2', version: 2 })];
    expect(computeDiff(patients, patients)).toHaveLength(0);
  });
});

describe('applyDiff', () => {
  it('applies add operation', () => {
    const local = [makeMockPatient({ id: 'p1' })];
    const newPatient = makeMockPatient({ id: 'p2' });
    const result = applyDiff(local, [{ type: 'add', patient: newPatient }]);
    expect(result).toHaveLength(2);
    expect(result.find((p) => p.id === 'p2')).toBeDefined();
  });

  it('applies update operation', () => {
    const p1 = makeMockPatient({ id: 'p1', version: 1, status: 'stable' });
    const updated = { ...p1, version: 2, status: 'critical' as const };
    const result = applyDiff([p1], [{ type: 'update', patient: updated, prev: p1 }]);
    expect(result[0]?.status).toBe('critical');
  });

  it('applies remove operation', () => {
    const local = [makeMockPatient({ id: 'p1' }), makeMockPatient({ id: 'p2' })];
    const result = applyDiff(local, [{ type: 'remove', id: 'p1' }]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('p2');
  });

  it('applies multiple operations', () => {
    const p1 = makeMockPatient({ id: 'p1', version: 1 });
    const p2 = makeMockPatient({ id: 'p2', version: 1 });
    const p3 = makeMockPatient({ id: 'p3', version: 1 });
    const result = applyDiff([p1, p2], [
      { type: 'add', patient: p3 },
      { type: 'remove', id: 'p2' },
    ]);
    expect(result.map((p) => p.id).sort()).toEqual(['p1', 'p3']);
  });
});
