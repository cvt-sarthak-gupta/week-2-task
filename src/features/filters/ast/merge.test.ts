import { describe, it, expect } from 'vitest';
import { mergeResults, deduplicateById } from './merge';
import { makeMockPatient } from '@/core/testing/factories';
import type { Patient } from '@/shared/types';

describe('mergeResults', () => {
  it('returns client results when no server overlap', () => {
    const p1 = makeMockPatient({ id: 'p1' });
    const p2 = makeMockPatient({ id: 'p2' });
    const local = new Map<string, Patient>([['p1', p1], ['p2', p2]]);
    const result = mergeResults(['p1', 'p2'], [], local);
    expect(result.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('appends server-only results after client results', () => {
    const p1 = makeMockPatient({ id: 'p1' });
    const p3 = makeMockPatient({ id: 'p3' });
    const local = new Map<string, Patient>([['p1', p1]]);
    const result = mergeResults(['p1'], [p3], local);
    expect(result.map((p) => p.id)).toEqual(['p1', 'p3']);
  });

  it('deduplicates ids present in both client and server', () => {
    const p1 = makeMockPatient({ id: 'p1' });
    const local = new Map<string, Patient>([['p1', p1]]);
    const result = mergeResults(['p1'], [p1], local);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('p1');
  });

  it('skips client ids with no local data', () => {
    const local = new Map<string, Patient>();
    const result = mergeResults(['p999'], [], local);
    expect(result).toHaveLength(0);
  });

  it('handles empty inputs', () => {
    expect(mergeResults([], [], new Map())).toEqual([]);
  });

  it('preserves client ordering', () => {
    const patients = ['p3', 'p1', 'p2'].map((id) => makeMockPatient({ id }));
    const local = new Map(patients.map((p) => [p.id, p]));
    const result = mergeResults(['p3', 'p1', 'p2'], [], local);
    expect(result.map((p) => p.id)).toEqual(['p3', 'p1', 'p2']);
  });
});

describe('deduplicateById', () => {
  it('keeps higher version when duplicates exist', () => {
    const old = makeMockPatient({ id: 'p1', version: 1 });
    const newer = makeMockPatient({ id: 'p1', version: 3 });
    const result = deduplicateById([old, newer]);
    expect(result).toHaveLength(1);
    expect(result[0]?.version).toBe(3);
  });

  it('no change when no duplicates', () => {
    const patients = [makeMockPatient({ id: 'p1' }), makeMockPatient({ id: 'p2' })];
    expect(deduplicateById(patients)).toHaveLength(2);
  });

  it('empty array', () => {
    expect(deduplicateById([])).toEqual([]);
  });
});
