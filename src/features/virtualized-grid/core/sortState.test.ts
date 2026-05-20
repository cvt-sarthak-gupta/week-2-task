import { describe, it, expect } from 'vitest';
import { toggleSort, getSortPriority, buildComparator, type SortState } from './sortState';

// ---------------------------------------------------------------------------
// toggleSort
// ---------------------------------------------------------------------------
describe('toggleSort', () => {
  it('adds new field with asc direction', () => {
    const state = toggleSort([], 'name');
    expect(state).toEqual([{ field: 'name', dir: 'asc' }]);
  });

  it('flips asc → desc for existing field', () => {
    const state: SortState = [{ field: 'name', dir: 'asc' }];
    const next = toggleSort(state, 'name');
    expect(next).toEqual([{ field: 'name', dir: 'desc' }]);
  });

  it('removes field that is already desc', () => {
    const state: SortState = [{ field: 'name', dir: 'desc' }];
    const next = toggleSort(state, 'name');
    expect(next).toHaveLength(0);
  });

  it('does not mutate the original state', () => {
    const original: SortState = [{ field: 'name', dir: 'asc' }];
    const next = toggleSort(original, 'name');
    expect(original).toEqual([{ field: 'name', dir: 'asc' }]);
    expect(next).not.toBe(original);
  });

  it('preserves other fields when adding a new one', () => {
    const state: SortState = [{ field: 'name', dir: 'asc' }];
    const next = toggleSort(state, 'age');
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual({ field: 'name', dir: 'asc' });
    expect(next[1]).toEqual({ field: 'age', dir: 'asc' });
  });

  it('preserves other fields when removing one', () => {
    const state: SortState = [
      { field: 'name', dir: 'asc' },
      { field: 'age', dir: 'desc' },
      { field: 'status', dir: 'asc' },
    ];
    const next = toggleSort(state, 'age');
    expect(next).toHaveLength(2);
    expect(next.find((s) => s.field === 'age')).toBeUndefined();
    expect(next.find((s) => s.field === 'name')).toBeDefined();
    expect(next.find((s) => s.field === 'status')).toBeDefined();
  });

  it('only the toggled field changes dir when flipping', () => {
    const state: SortState = [
      { field: 'name', dir: 'asc' },
      { field: 'age', dir: 'asc' },
    ];
    const next = toggleSort(state, 'name');
    expect(next.find((s) => s.field === 'name')?.dir).toBe('desc');
    expect(next.find((s) => s.field === 'age')?.dir).toBe('asc');
  });
});

// ---------------------------------------------------------------------------
// getSortPriority
// ---------------------------------------------------------------------------
describe('getSortPriority', () => {
  it('returns null when field is not in state', () => {
    expect(getSortPriority([], 'name')).toBeNull();
  });

  it('returns 1-based position for the field', () => {
    const state: SortState = [
      { field: 'name', dir: 'asc' },
      { field: 'age', dir: 'desc' },
      { field: 'status', dir: 'asc' },
    ];
    expect(getSortPriority(state, 'name')).toBe(1);
    expect(getSortPriority(state, 'age')).toBe(2);
    expect(getSortPriority(state, 'status')).toBe(3);
  });

  it('returns null for an empty state', () => {
    expect(getSortPriority([], 'anything')).toBeNull();
  });

  it('returns null for a field removed from multi-column sort', () => {
    const state: SortState = [{ field: 'age', dir: 'asc' }];
    expect(getSortPriority(state, 'name')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildComparator
// ---------------------------------------------------------------------------
interface Row {
  name: string;
  age: number;
  status: string;
}

function row(name: string, age: number, status = 'stable'): Row {
  return { name, age, status };
}

describe('buildComparator', () => {
  it('empty state — comparator returns 0 for any two items', () => {
    const cmp = buildComparator<Row>([]);
    expect(cmp(row('Alice', 30), row('Bob', 25))).toBe(0);
  });

  it('sorts numbers ascending', () => {
    const cmp = buildComparator<Row>([{ field: 'age', dir: 'asc' }]);
    expect(cmp(row('A', 20), row('B', 30))).toBeLessThan(0);
    expect(cmp(row('A', 30), row('B', 20))).toBeGreaterThan(0);
    expect(cmp(row('A', 25), row('B', 25))).toBe(0);
  });

  it('sorts numbers descending', () => {
    const cmp = buildComparator<Row>([{ field: 'age', dir: 'desc' }]);
    expect(cmp(row('A', 20), row('B', 30))).toBeGreaterThan(0);
    expect(cmp(row('A', 30), row('B', 20))).toBeLessThan(0);
  });

  it('sorts strings ascending using localeCompare', () => {
    const cmp = buildComparator<Row>([{ field: 'name', dir: 'asc' }]);
    expect(cmp(row('Alice', 0), row('Bob', 0))).toBeLessThan(0);
    expect(cmp(row('Bob', 0), row('Alice', 0))).toBeGreaterThan(0);
    expect(cmp(row('Alice', 0), row('Alice', 0))).toBe(0);
  });

  it('sorts strings descending', () => {
    const cmp = buildComparator<Row>([{ field: 'name', dir: 'desc' }]);
    expect(cmp(row('Alice', 0), row('Bob', 0))).toBeGreaterThan(0);
    expect(cmp(row('Bob', 0), row('Alice', 0))).toBeLessThan(0);
  });

  it('multi-column: secondary sort breaks ties from primary', () => {
    const cmp = buildComparator<Row>([
      { field: 'status', dir: 'asc' },
      { field: 'age', dir: 'asc' },
    ]);
    const a = row('A', 30, 'stable');
    const b = row('B', 25, 'stable'); // same status, b is younger
    // Primary: status equal → fall through to age
    expect(cmp(a, b)).toBeGreaterThan(0); // a (age 30) > b (age 25)
  });

  it('multi-column: primary field dominates when different', () => {
    const cmp = buildComparator<Row>([
      { field: 'status', dir: 'asc' },
      { field: 'age', dir: 'asc' },
    ]);
    const a = row('A', 99, 'critical');
    const b = row('B', 1, 'stable');
    // 'critical' < 'stable' alphabetically
    expect(cmp(a, b)).toBeLessThan(0);
  });

  it('returns consistent result for stable sort (equal rows)', () => {
    const cmp = buildComparator<Row>([{ field: 'age', dir: 'asc' }]);
    expect(cmp(row('A', 50), row('B', 50))).toBe(0);
  });

  it('falls back to 0 for unknown (non-string, non-number) field values', () => {
    const cmp = buildComparator<Row>([{ field: 'unknownField', dir: 'asc' }]);
    expect(cmp(row('A', 1), row('B', 2))).toBe(0);
  });

  it('can sort an array correctly end-to-end', () => {
    const rows = [row('Charlie', 40), row('Alice', 25), row('Bob', 35)];
    const cmp = buildComparator<Row>([{ field: 'name', dir: 'asc' }]);
    const sorted = [...rows].sort(cmp).map((r) => r.name);
    expect(sorted).toEqual(['Alice', 'Bob', 'Charlie']);
  });
});
