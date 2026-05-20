import { describe, it, expect } from 'vitest';
import { deserializeFilter } from './filter-deserializer';

describe('deserializeFilter', () => {
  describe('compare nodes', () => {
    it('parses eq(field,value)', () => {
      const node = deserializeFilter('eq(status,critical)');
      expect(node).toEqual({ kind: 'compare', op: 'eq', field: 'status', value: 'critical' });
    });

    it('parses numeric value with n: prefix', () => {
      const node = deserializeFilter('gte(age,n:65)');
      expect(node).toEqual({ kind: 'compare', op: 'gte', field: 'age', value: 65 });
    });

    it('parses boolean value with b: prefix', () => {
      const node = deserializeFilter('eq(active,b:true)');
      expect(node).toEqual({ kind: 'compare', op: 'eq', field: 'active', value: true });
    });

    it('parses string value with s: prefix', () => {
      const node = deserializeFilter('contains(notes,s:hello)');
      expect(node).toEqual({ kind: 'compare', op: 'contains', field: 'notes', value: 'hello' });
    });

    it('parses all comparison operators', () => {
      for (const op of ['eq', 'neq', 'contains', 'startsWith', 'gt', 'gte', 'lt', 'lte']) {
        expect(() => deserializeFilter(`${op}(field,value)`)).not.toThrow();
      }
    });

    it('throws on unknown operator', () => {
      expect(() => deserializeFilter('hack(field,value)')).toThrow('Unknown filter operator');
    });
  });

  describe('logical nodes', () => {
    it('parses and() with children', () => {
      const node = deserializeFilter('and(eq(status,critical),gte(age,n:65))');
      expect(node.kind).toBe('and');
    });

    it('parses or() with children', () => {
      const node = deserializeFilter('or(eq(status,critical),eq(status,stable))');
      expect(node.kind).toBe('or');
    });

    it('parses not() wrapping a child', () => {
      const node = deserializeFilter('not(eq(status,discharged))');
      expect(node.kind).toBe('not');
    });

    it('parses empty and() as vacuously true', () => {
      const node = deserializeFilter('and()');
      expect(node).toEqual({ kind: 'and', children: [] });
    });

    it('parses empty or() as vacuously false', () => {
      const node = deserializeFilter('or()');
      expect(node).toEqual({ kind: 'or', children: [] });
    });
  });

  describe('range nodes', () => {
    it('parses a range with inclusive flags', () => {
      const node = deserializeFilter('range(age,n:18,n:65,11)');
      expect(node).toEqual({ kind: 'range', field: 'age', min: 18, max: 65, inclusive: [true, true] });
    });

    it('parses a range with exclusive flags', () => {
      const node = deserializeFilter('range(age,n:18,n:65,00)');
      expect(node).toEqual({ kind: 'range', field: 'age', min: 18, max: 65, inclusive: [false, false] });
    });
  });

  describe('error cases', () => {
    it('throws on malformed input', () => {
      expect(() => deserializeFilter('(bad')).toThrow();
    });

    it('throws on trailing tokens', () => {
      expect(() => deserializeFilter('eq(a,b)extra')).toThrow();
    });

    it('throws on empty input', () => {
      expect(() => deserializeFilter('')).toThrow();
    });
  });
});
