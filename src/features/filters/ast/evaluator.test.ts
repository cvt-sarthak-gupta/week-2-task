import { describe, it, expect } from 'vitest';
import { evaluate } from './evaluator';
import { Filter } from './types';
import { makeMockPatient } from '@/core/testing/factories';
import type { Patient } from '@/shared/types';

const patient = makeMockPatient({ id: 'p1', age: 65, status: 'critical', ward: 'ICU', firstName: 'Alice', lastName: 'Smith' });
const stablePatient = makeMockPatient({ id: 'p2', age: 30, status: 'stable', ward: 'General', firstName: 'Bob' });

describe('evaluate — AND', () => {
  it('returns true when all children match', () => {
    expect(evaluate(Filter.and(Filter.eq('status', 'critical'), Filter.gte('age', 60)), patient)).toBe(true);
  });
  it('returns false when any child fails', () => {
    expect(evaluate(Filter.and(Filter.eq('status', 'critical'), Filter.lte('age', 40)), patient)).toBe(false);
  });
  it('empty AND returns true', () => {
    expect(evaluate(Filter.and(), patient)).toBe(true);
  });
});

describe('evaluate — OR', () => {
  it('returns true when at least one child matches', () => {
    expect(evaluate(Filter.or(Filter.eq('status', 'stable'), Filter.eq('status', 'critical')), patient)).toBe(true);
  });
  it('returns false when no children match', () => {
    expect(evaluate(Filter.or(Filter.eq('status', 'discharged'), Filter.eq('status', 'pending')), patient)).toBe(false);
  });
  it('empty OR returns false', () => {
    expect(evaluate(Filter.or(), patient)).toBe(false);
  });
});

describe('evaluate — NOT', () => {
  it('negates a true condition', () => {
    expect(evaluate(Filter.not(Filter.eq('status', 'critical')), patient)).toBe(false);
  });
  it('negates a false condition', () => {
    expect(evaluate(Filter.not(Filter.eq('status', 'stable')), patient)).toBe(true);
  });
  it('double negation returns true', () => {
    expect(evaluate(Filter.not(Filter.not(Filter.eq('status', 'critical'))), patient)).toBe(true);
  });
});

describe('evaluate — compare operators', () => {
  it('eq — case-insensitive string match', () => {
    expect(evaluate(Filter.eq('status', 'CRITICAL'), patient)).toBe(true);
  });
  it('neq — not equal', () => {
    expect(evaluate(Filter.neq('status', 'stable'), patient)).toBe(true);
    expect(evaluate(Filter.neq('status', 'critical'), patient)).toBe(false);
  });
  it('contains', () => {
    expect(evaluate(Filter.contains('lastName', 'mit'), patient)).toBe(true);
    expect(evaluate(Filter.contains('lastName', 'jones'), patient)).toBe(false);
  });
  it('startsWith', () => {
    expect(evaluate(Filter.startsWith('firstName', 'ali'), patient)).toBe(true);
    expect(evaluate(Filter.startsWith('firstName', 'bob'), patient)).toBe(false);
  });
  it('gt', () => {
    expect(evaluate(Filter.gt('age', 60), patient)).toBe(true);
    expect(evaluate(Filter.gt('age', 65), patient)).toBe(false);
  });
  it('gte', () => {
    expect(evaluate(Filter.gte('age', 65), patient)).toBe(true);
    expect(evaluate(Filter.gte('age', 66), patient)).toBe(false);
  });
  it('lt', () => {
    expect(evaluate(Filter.lt('age', 70), patient)).toBe(true);
    expect(evaluate(Filter.lt('age', 65), patient)).toBe(false);
  });
  it('lte', () => {
    expect(evaluate(Filter.lte('age', 65), patient)).toBe(true);
    expect(evaluate(Filter.lte('age', 64), patient)).toBe(false);
  });
  it('returns false for undefined field', () => {
    expect(evaluate(Filter.eq('notes' as 'notes', 'anything'), stablePatient)).toBe(false);
  });
});

describe('evaluate — range', () => {
  it('inclusive range', () => {
    expect(evaluate(Filter.range('age', 60, 70, [true, true]), patient)).toBe(true);
    expect(evaluate(Filter.range('age', 65, 65, [true, true]), patient)).toBe(true);
  });
  it('exclusive min', () => {
    expect(evaluate(Filter.range('age', 65, 70, [false, true]), patient)).toBe(false);
    expect(evaluate(Filter.range('age', 64, 70, [false, true]), patient)).toBe(true);
  });
  it('exclusive max', () => {
    expect(evaluate(Filter.range('age', 60, 65, [true, false]), patient)).toBe(false);
    expect(evaluate(Filter.range('age', 60, 66, [true, false]), patient)).toBe(true);
  });
  it('out of range', () => {
    expect(evaluate(Filter.range('age', 70, 80, [true, true]), patient)).toBe(false);
  });
  it('non-numeric field returns false', () => {
    expect(evaluate(Filter.range('status', 0, 10, [true, true]), patient)).toBe(false);
  });
  it('equal min/max (point range inclusive)', () => {
    expect(evaluate(Filter.range('age', 65, 65, [true, true]), patient)).toBe(true);
    expect(evaluate(Filter.range('age', 65, 65, [false, false]), patient)).toBe(false);
  });
});

describe('evaluate — null/undefined field (100% branch on compareValues null check)', () => {
  it('returns false when field value is explicitly null', () => {
    // counter=0 when both fixture patients are created, so .notes is always set via
    // the factory's `counter % 5 === 0` condition. Explicitly force null to hit
    // the `fieldVal == null` → return false branch in compareValues.
    const p = { ...patient, notes: null } as unknown as Patient;
    expect(evaluate(Filter.eq('notes' as keyof Patient, 'anything'), p)).toBe(false);
  });
});

describe('evaluate — exhaustive default branches', () => {
  it('throws for an unknown compare op', () => {
    const node = { kind: 'compare', field: 'age', op: '__unknown__', value: 1 } as unknown as Parameters<typeof evaluate>[0];
    expect(() => evaluate(node, patient)).toThrow('Unhandled discriminated union value');
  });
  it('throws for an unknown node kind', () => {
    const node = { kind: '__unknown__' } as unknown as Parameters<typeof evaluate>[0];
    expect(() => evaluate(node, patient)).toThrow('Unhandled discriminated union value');
  });
});

describe('evaluate — nested expressions', () => {
  it('NOT(AND(...)) works correctly', () => {
    const expr = Filter.not(Filter.and(Filter.eq('status', 'critical'), Filter.gt('age', 60)));
    expect(evaluate(expr, patient)).toBe(false); // patient IS critical AND age > 60
    expect(evaluate(expr, stablePatient)).toBe(true);
  });
  it('OR of ANDs', () => {
    const expr = Filter.or(
      Filter.and(Filter.eq('status', 'critical'), Filter.gte('age', 65)),
      Filter.and(Filter.eq('status', 'stable'), Filter.lt('age', 40)),
    );
    expect(evaluate(expr, patient)).toBe(true);
    expect(evaluate(expr, stablePatient)).toBe(true);
    expect(evaluate(expr, makeMockPatient({ id: 'p3', age: 50, status: 'pending' }))).toBe(false);
  });
});
