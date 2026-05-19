import { describe, it, expect } from 'vitest';
import { serializeUrl, deserializeUrl } from './url-format';
import { Filter } from './types';
import type { FilterNode } from './types';
import fc from 'fast-check';

function rt(node: FilterNode): FilterNode {
  return deserializeUrl(serializeUrl(node));
}

// ---------------------------------------------------------------------------
// Readability smoke tests — these assert the exact URL strings produced
// so a human reviewing them can see they're sensible
// ---------------------------------------------------------------------------

describe('serializeUrl — readable output', () => {
  it('simple eq is field:eq:value', () => {
    expect(serializeUrl(Filter.eq('status', 'critical'))).toBe('status:eq:critical');
  });

  it('gte is field:gte:value', () => {
    expect(serializeUrl(Filter.gte('age', 65))).toBe('age:gte:65');
  });

  it('contains maps to :has:', () => {
    expect(serializeUrl(Filter.contains('firstName', 'alice'))).toBe('firstName:has:alice');
  });

  it('startsWith maps to :sw:', () => {
    expect(serializeUrl(Filter.startsWith('lastName', 'smi'))).toBe('lastName:sw:smi');
  });

  it('neq maps to :ne:', () => {
    expect(serializeUrl(Filter.neq('ward', 'ICU'))).toBe('ward:ne:ICU');
  });

  it('AND group is readable', () => {
    const f = Filter.and(Filter.eq('status', 'critical'), Filter.gte('age', 65));
    expect(serializeUrl(f)).toBe('and(status:eq:critical,age:gte:65)');
  });

  it('OR group is readable', () => {
    const f = Filter.or(Filter.eq('status', 'critical'), Filter.eq('status', 'stable'));
    expect(serializeUrl(f)).toBe('or(status:eq:critical,status:eq:stable)');
  });

  it('NOT is readable', () => {
    expect(serializeUrl(Filter.not(Filter.eq('status', 'critical')))).toBe('not(status:eq:critical)');
  });

  it('range both-inclusive omits flags', () => {
    expect(serializeUrl(Filter.range('age', 60, 80))).toBe('age:btwn:60:80');
  });

  it('range exclusive-min shows :ei', () => {
    expect(serializeUrl(Filter.range('age', 60, 80, [false, true]))).toBe('age:btwn:60:80:ei');
  });

  it('range both-exclusive shows :ee', () => {
    expect(serializeUrl(Filter.range('age', 60, 80, [false, false]))).toBe('age:btwn:60:80:ee');
  });

  it('complex nested expression is human-readable', () => {
    const f = Filter.and(
      Filter.or(Filter.eq('status', 'critical'), Filter.eq('status', 'stable')),
      Filter.gte('age', 18),
      Filter.not(Filter.eq('ward', 'ICU')),
    );
    expect(serializeUrl(f)).toBe(
      'and(or(status:eq:critical,status:eq:stable),age:gte:18,not(ward:eq:ICU))',
    );
  });

  it('no percent-encoding needed for typical values', () => {
    const f = Filter.and(Filter.eq('status', 'critical'), Filter.gte('age', 65), Filter.eq('ward', 'ICU'));
    const url = `?filter=${serializeUrl(f)}`;
    // The full URL string should not contain % (no encoding needed)
    expect(url).not.toContain('%');
    expect(url).toBe('?filter=and(status:eq:critical,age:gte:65,ward:eq:ICU)');
  });
});

// ---------------------------------------------------------------------------
// Round-trip tests
// ---------------------------------------------------------------------------

describe('round-trip: serializeUrl → deserializeUrl', () => {
  it('simple eq', () => { expect(rt(Filter.eq('status', 'critical'))).toEqual(Filter.eq('status', 'critical')); });
  it('neq', ()  => { expect(rt(Filter.neq('ward', 'ICU'))).toEqual(Filter.neq('ward', 'ICU')); });
  it('contains', () => { expect(rt(Filter.contains('firstName', 'alice'))).toEqual(Filter.contains('firstName', 'alice')); });
  it('startsWith', () => { expect(rt(Filter.startsWith('lastName', 'smi'))).toEqual(Filter.startsWith('lastName', 'smi')); });
  it('gt/gte/lt/lte numeric', () => {
    expect(rt(Filter.gt('age', 60))).toEqual(Filter.gt('age', 60));
    expect(rt(Filter.gte('age', 65))).toEqual(Filter.gte('age', 65));
    expect(rt(Filter.lt('age', 18))).toEqual(Filter.lt('age', 18));
    expect(rt(Filter.lte('age', 100))).toEqual(Filter.lte('age', 100));
  });
  it('boolean value', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = Filter.eq('status' as any, true);
    expect(rt(f)).toEqual(f);
  });
  it('range inclusive', () => {
    const f = Filter.range('age', 60, 80, [true, true]);
    expect(rt(f)).toEqual(f);
  });
  it('range exclusive min', () => {
    const f = Filter.range('age', 60, 80, [false, true]);
    expect(rt(f)).toEqual(f);
  });
  it('range both exclusive', () => {
    const f = Filter.range('age', 60, 80, [false, false]);
    expect(rt(f)).toEqual(f);
  });
  it('empty AND', () => { expect(rt(Filter.and())).toEqual(Filter.and()); });
  it('empty OR', () => { expect(rt(Filter.or())).toEqual(Filter.or()); });
  it('NOT wrapper', () => {
    const f = Filter.not(Filter.eq('status', 'critical'));
    expect(rt(f)).toEqual(f);
  });
  it('nested OR of ANDs', () => {
    const f = Filter.or(
      Filter.and(Filter.eq('status', 'critical'), Filter.gte('age', 65)),
      Filter.and(Filter.eq('ward', 'Pediatrics'), Filter.lt('age', 18)),
    );
    expect(rt(f)).toEqual(f);
  });
  it('value with comma is escaped and round-trips', () => {
    const f = Filter.contains('firstName', 'Smith,Jr');
    expect(rt(f)).toEqual(f);
  });
  it('value with closing paren is escaped and round-trips', () => {
    const f = Filter.eq('ward', 'Ward(A)');
    expect(rt(f)).toEqual(f);
  });
  it('value with backslash is escaped and round-trips', () => {
    const f = Filter.eq('mrn', 'A\\B');
    expect(rt(f)).toEqual(f);
  });
});

// ---------------------------------------------------------------------------
// Property-based: any eq with a string value round-trips
// ---------------------------------------------------------------------------

describe('property-based round-trip', () => {
  it('eq node for any common string value', () => {
    // The URL format infers types from raw strings (no explicit type prefix), so values that
    // look like numbers or booleans will be deserialized as that type — exclude them here.
    const nonAmbiguousString = fc
      .string({ minLength: 0, maxLength: 50 })
      .filter((s) => !s.includes('\0'))
      .filter((s) => s.trim() === '' || isNaN(Number(s)))
      .filter((s) => s !== 'true' && s !== 'false');

    fc.assert(
      fc.property(nonAmbiguousString, (val) => {
        const node = Filter.eq('ward', val);
        expect(deserializeUrl(serializeUrl(node))).toEqual(node);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// deserializeUrl — invalid input
// ---------------------------------------------------------------------------

describe('deserializeUrl — error handling', () => {
  it('throws on unknown operator', () => {
    expect(() => deserializeUrl('age:unknown:65')).toThrow();
  });
  it('throws on unexpected structural token after complete expression', () => {
    // A comma after a complete top-level expression has nowhere to go
    expect(() => deserializeUrl('status:eq:critical,extra:eq:junk')).toThrow();
  });
  it('throws on missing value', () => {
    expect(() => deserializeUrl('status:eq')).toThrow();
  });
});
