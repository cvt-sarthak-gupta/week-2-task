import { describe, it, expect } from 'vitest';
import { serialize, deserialize, serializeToUrlParam, deserializeFromUrlParam } from './serialize';
import { Filter } from './types';
import type { FilterNode } from './types';
import fc from 'fast-check';

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

  it('boolean true value', () => {
    const node = Filter.eq('status', true);
    expect(roundTrip(node)).toEqual(node);
  });

  it('boolean false value', () => {
    const node = Filter.eq('status', false);
    expect(roundTrip(node)).toEqual(node);
    expect(serialize(node)).toContain('b:false');
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

describe('serializeToUrlParam / deserializeFromUrlParam', () => {
  it('round-trips through percent-encoding', () => {
    const node = Filter.and(Filter.eq('status', 'critical'), Filter.gte('age', 65));
    const param = serializeToUrlParam(node);
    // Structural chars like ':' and ',' must be encoded; '(' and ')' are left as-is by encodeURIComponent
    expect(param).not.toContain(':');
    expect(param).not.toContain(',');
    expect(deserializeFromUrlParam(param)).toEqual(node);
  });

  it('handles values with special URL characters', () => {
    const node = Filter.eq('ward', 'Ward (A) & B');
    expect(deserializeFromUrlParam(serializeToUrlParam(node))).toEqual(node);
  });
});

describe('deserialize — legacy value fallbacks (no type prefix)', () => {
  it('bare "true" parses as boolean true', () => {
    // Manually craft a serialized form without a type prefix to exercise legacy path
    const raw = 'eq(status,true)';
    const node = deserialize(raw);
    expect(node).toMatchObject({ kind: 'compare', op: 'eq', value: true });
  });

  it('bare "false" parses as boolean false', () => {
    const node = deserialize('eq(status,false)');
    expect(node).toMatchObject({ kind: 'compare', op: 'eq', value: false });
  });

  it('bare numeric string parses as number', () => {
    const node = deserialize('eq(age,42)');
    expect(node).toMatchObject({ kind: 'compare', op: 'eq', value: 42 });
  });

  it('bare non-numeric string stays as string', () => {
    const node = deserialize('eq(ward,ICU)');
    expect(node).toMatchObject({ kind: 'compare', op: 'eq', value: 'ICU' });
  });
});

describe('deserialize — edge cases and error paths', () => {
  it('throws on empty input', () => {
    expect(() => deserialize('')).toThrow();
  });

  it('throws on unexpected trailing tokens', () => {
    expect(() => deserialize('eq(status,s:critical)extra')).toThrow('Unexpected tokens');
  });

  it('throws when identifier missing before lparen', () => {
    expect(() => deserialize('(status,s:critical)')).toThrow();
  });

  it('handles empty string value via expectValueIdent sentinel', () => {
    const node = Filter.eq('firstName', '');
    expect(roundTrip(node)).toEqual(node);
  });

  it('raw eq(field,) with no s: prefix parses as empty string (expectValueIdent rparen branch)', () => {
    // When the value token is completely absent (raw format without s: prefix), the parser
    // peeks rparen and returns the sentinel 's:' which decodes to ''
    const node = deserialize('eq(firstName,)');
    expect(node).toMatchObject({ kind: 'compare', field: 'firstName', op: 'eq', value: '' });
  });

  it('trailing comma before ) in AND is accepted (parseNode trailing-comma break)', () => {
    // A trailing comma before ) should be tolerated — the peek(rparen) break fires
    const node = deserialize('and(eq(status,s:a),eq(status,s:b),)');
    expect(node).toMatchObject({ kind: 'and', children: [{ value: 'a' }, { value: 'b' }] });
  });

  it('backslash at end of tokenizer input exercises ?? branch and throws on missing )', () => {
    // Input ends with backslash: input[i] ?? '' fires (undefined branch), then expect(rparen) fails
    expect(() => deserialize('eq(status,s:foo\\')).toThrow();
  });

  it('truncated input (no closing paren) exercises !t branch in expect', () => {
    expect(() => deserialize('eq(status')).toThrow();
  });

  it('wrong token type exercises t.type !== type branch in expect', () => {
    // "eq(status)" — parser finds rparen where it expects a comma after the field name
    expect(() => deserialize('eq(status)')).toThrow(/Expected comma/);
  });

  it('range with both inclusive flags true', () => {
    const node = Filter.range('age', 0, 100, [true, true]);
    expect(roundTrip(node)).toEqual(node);
  });

  it('range with both inclusive flags false', () => {
    const node = Filter.range('age', 18, 65, [false, false]);
    expect(roundTrip(node)).toEqual(node);
  });

  it('not node wrapping a range', () => {
    const node = Filter.not(Filter.range('age', 18, 65, [true, false]));
    expect(roundTrip(node)).toEqual(node);
  });

  it('backslash-escaped backslash in value', () => {
    const node = Filter.eq('ward', 'path\\to');
    expect(roundTrip(node)).toEqual(node);
  });

  it('throws for an unknown node kind in serialize', () => {
    const node = { kind: '__unknown__' } as unknown as FilterNode;
    expect(() => serialize(node)).toThrow('Unhandled discriminated union value');
  });
});

function roundTrip(node: FilterNode): FilterNode {
  return deserialize(serialize(node));
}
