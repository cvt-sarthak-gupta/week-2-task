import { describe, it, expect } from 'vitest';
import { Filter } from './types';
import { serialize, deserialize } from './serialize';
import { evaluate } from './evaluator';
import { makeMockPatient } from '@/core/testing/factories';
import type { FilterNode } from './types';

/** Round-trip any node through serialize → URL encode → deserialize */
function urlRoundTrip(node: FilterNode): FilterNode {
  const encoded = encodeURIComponent(serialize(node));
  return deserialize(decodeURIComponent(encoded));
}

const alice = makeMockPatient({ id: 'p1', firstName: 'Alice', lastName: 'Smith', age: 65, status: 'critical', ward: 'ICU' });
const bob   = makeMockPatient({ id: 'p2', firstName: 'Bob',   lastName: 'Jones', age: 30, status: 'stable',   ward: 'General' });
const carol = makeMockPatient({ id: 'p3', firstName: 'Carol', lastName: 'White', age: 14, status: 'admitted',  ward: 'Pediatrics' });

// ---------------------------------------------------------------------------
// 3.1 — Filter Expression System
// ---------------------------------------------------------------------------

describe('Filter.and', () => {
  it('matches when all children pass', () => {
    const f = Filter.and(Filter.eq('ward', 'ICU'), Filter.gte('age', 60));
    expect(evaluate(f, alice)).toBe(true);
    expect(evaluate(f, bob)).toBe(false);
  });

  it('empty AND is vacuously true', () => {
    expect(evaluate(Filter.and(), alice)).toBe(true);
  });
});

describe('Filter.or', () => {
  it('matches when any child passes', () => {
    const f = Filter.or(Filter.eq('status', 'critical'), Filter.eq('status', 'stable'));
    expect(evaluate(f, alice)).toBe(true);
    expect(evaluate(f, carol)).toBe(false);
  });

  it('empty OR is vacuously false', () => {
    expect(evaluate(Filter.or(), alice)).toBe(false);
  });
});

describe('Filter.not', () => {
  it('negates a matching condition', () => {
    const f = Filter.not(Filter.eq('status', 'critical'));
    expect(evaluate(f, alice)).toBe(false);
    expect(evaluate(f, bob)).toBe(true);
  });

  it('double negation is identity', () => {
    const f = Filter.not(Filter.not(Filter.eq('ward', 'ICU')));
    expect(evaluate(f, alice)).toBe(true);
    expect(evaluate(f, bob)).toBe(false);
  });
});

describe('range node', () => {
  it('inclusive range matches boundaries', () => {
    const f = Filter.range('age', 14, 30, [true, true]);
    expect(evaluate(f, bob)).toBe(true);
    expect(evaluate(f, carol)).toBe(true);
    expect(evaluate(f, alice)).toBe(false);
  });

  it('exclusive boundaries', () => {
    const f = Filter.range('age', 14, 30, [false, false]);
    expect(evaluate(f, carol)).toBe(false); // 14 excluded
    expect(evaluate(f, bob)).toBe(false);   // 30 excluded
    expect(evaluate(f, makeMockPatient({ id: 'px', age: 20 }))).toBe(true);
  });
});

describe('contains / startsWith', () => {
  it('contains is case-insensitive substring match', () => {
    expect(evaluate(Filter.contains('firstName', 'ali'), alice)).toBe(true);
    expect(evaluate(Filter.contains('firstName', 'BOB'), bob)).toBe(true);
    expect(evaluate(Filter.contains('firstName', 'xyz'), alice)).toBe(false);
  });

  it('startsWith is case-insensitive prefix match', () => {
    expect(evaluate(Filter.startsWith('lastName', 'smi'), alice)).toBe(true);
    expect(evaluate(Filter.startsWith('lastName', 'mit'), alice)).toBe(false);
  });
});

describe('complex nested expressions', () => {
  it('OR of AND groups (triage query)', () => {
    const f = Filter.or(
      Filter.and(Filter.eq('status', 'critical'), Filter.gte('age', 60)),
      Filter.and(Filter.eq('ward', 'Pediatrics'), Filter.lt('age', 18)),
    );
    expect(evaluate(f, alice)).toBe(true);   // critical + 65yo
    expect(evaluate(f, carol)).toBe(true);   // pediatrics + 14yo
    expect(evaluate(f, bob)).toBe(false);
  });

  it('NOT of AND', () => {
    const f = Filter.not(Filter.and(Filter.eq('status', 'stable'), Filter.eq('ward', 'General')));
    expect(evaluate(f, bob)).toBe(false);   // stable + General → NOT false
    expect(evaluate(f, alice)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3.2 — Serialization
// ---------------------------------------------------------------------------

describe('serialize → deserialize round-trip', () => {
  it('complex nested expression', () => {
    const f = Filter.and(
      Filter.or(Filter.eq('status', 'critical'), Filter.eq('status', 'stable')),
      Filter.not(Filter.lt('age', 18)),
      Filter.range('age', 0, 120, [true, true]),
    );
    expect(deserialize(serialize(f))).toEqual(f);
  });

  it('string with special chars survives URL round-trip', () => {
    const f = Filter.contains('notes', 'Smith,Jr.(III)');
    expect(urlRoundTrip(f)).toEqual(f);
  });

  it('boolean values round-trip', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = Filter.eq('status' as any, true);
    expect(urlRoundTrip(f)).toEqual(f);
  });

  it('numeric values round-trip without coercion', () => {
    const f = Filter.gt('age', 65);
    const rt = urlRoundTrip(f);
    expect(rt).toEqual(f);
    if (rt.kind === 'compare') expect(typeof rt.value).toBe('number');
  });

  it('empty AND/OR groups round-trip', () => {
    expect(urlRoundTrip(Filter.and())).toEqual(Filter.and());
    expect(urlRoundTrip(Filter.or())).toEqual(Filter.or());
  });
});

// ---------------------------------------------------------------------------
// 3.3 — Hybrid merge
// ---------------------------------------------------------------------------

import { mergeResults, deduplicateById } from '@/features/filters/ast/merge';
import type { Patient } from '@/shared/types';

describe('mergeResults', () => {
  it('client records appear first, server-only records append', () => {
    const local = new Map<string, Patient>([['p1', alice], ['p2', bob]]);
    const serverExtra = makeMockPatient({ id: 'p3' });
    const result = mergeResults(['p1'], [serverExtra], local);
    expect(result.map((p) => p.id)).toEqual(['p1', 'p3']);
  });

  it('deduplicates records present in both', () => {
    const local = new Map<string, Patient>([['p1', alice]]);
    const result = mergeResults(['p1'], [alice], local);
    expect(result).toHaveLength(1);
  });

  it('server-side version wins for same id (higher version)', () => {
    const p1v2 = { ...alice, version: 2 };
    const p1v3 = { ...alice, version: 3 };
    expect(deduplicateById([p1v2, p1v3])[0]?.version).toBe(3);
    expect(deduplicateById([p1v3, p1v2])[0]?.version).toBe(3);
  });
});
