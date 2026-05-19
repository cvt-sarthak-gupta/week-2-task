import { describe, it, expect } from 'vitest';
import { serialize, deserialize } from './serialize';
import { Filter } from './types';
import type { FilterNode } from './types';
import fc from 'fast-check';

function roundTrip(node: FilterNode): FilterNode {
  return deserialize(serialize(node));
}

describe('serialize → deserialize round-trip', () => {
  it('simple eq', () => {
    const node = Filter.eq('status', 'critical');
    expect(roundTrip(node)).toEqual(node);
  });

  it('range', () => {
    const node = Filter.range('age', 60, 80, [true, false]);
    expect(roundTrip(node)).toEqual(node);
  });

  it('nested AND/OR/NOT', () => {
    const node = Filter.and(
      Filter.or(Filter.eq('status', 'critical'), Filter.eq('status', 'stable')),
      Filter.not(Filter.lt('age', 18)),
    );
    expect(roundTrip(node)).toEqual(node);
  });

  it('empty AND', () => {
    const node = Filter.and();
    expect(roundTrip(node)).toEqual(node);
  });

  it('empty OR', () => {
    const node = Filter.or();
    expect(roundTrip(node)).toEqual(node);
  });

  it('value with special chars (comma)', () => {
    const node = Filter.contains('firstName', 'Smith,Jr');
    expect(roundTrip(node)).toEqual(node);
  });

  it('value with parentheses', () => {
    const node = Filter.eq('ward', 'Ward(A)');
    expect(roundTrip(node)).toEqual(node);
  });

  it('numeric values', () => {
    const node = Filter.gt('age', 65);
    const result = roundTrip(node);
    expect(result).toEqual(node);
  });

  it('boolean values', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = Filter.eq('status' as any, true);
    const result = roundTrip(node);
    expect(result).toEqual(node);
  });

  it('deeply nested expression', () => {
    const node = Filter.not(Filter.and(
      Filter.or(Filter.eq('status', 'critical'), Filter.range('age', 0, 18, [true, false])),
      Filter.not(Filter.contains('ward', 'ICU')),
    ));
    expect(roundTrip(node)).toEqual(node);
  });
});

describe('URL-safe serialization', () => {
  it('produces valid URL strings (no unescaped special chars)', () => {
    const node = Filter.and(Filter.eq('status', 'critical'), Filter.gte('age', 65));
    const serialized = serialize(node);
    expect(() => new URL(`http://x.com?f=${encodeURIComponent(serialized)}`)).not.toThrow();
  });
});

describe('property-based: round-trip is identity', () => {
  it('eq node for any string value', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 50 }).filter((s) => !s.includes('\0')),
        (val) => {
          const node = Filter.eq('ward', val);
          expect(deserialize(serialize(node))).toEqual(node);
        },
      ),
    );
  });
});
