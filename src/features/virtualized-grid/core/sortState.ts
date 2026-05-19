export type SortDir = 'asc' | 'desc';

export interface SortEntry {
  readonly field: string;
  readonly dir: SortDir;
}

export type SortState = readonly SortEntry[];

export function toggleSort(state: SortState, field: string): SortState {
  const existing = state.find((s) => s.field === field);
  if (!existing) {
    return [...state, { field, dir: 'asc' }];
  }
  if (existing.dir === 'asc') {
    return state.map((s) => (s.field === field ? { ...s, dir: 'desc' as const } : s));
  }
  // Remove the sort entry
  return state.filter((s) => s.field !== field);
}

export function getSortPriority(state: SortState, field: string): number | null {
  const idx = state.findIndex((s) => s.field === field);
  return idx === -1 ? null : idx + 1;
}

/** Returns a comparator function for the current sort state. */
export function buildComparator<T>(state: SortState): (a: T, b: T) => number {
  return (a, b) => {
    for (const { field, dir } of state) {
      const av = (a as Record<string, unknown>)[field];
      const bv = (b as Record<string, unknown>)[field];
      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv;
      } else if (typeof av === 'string' && typeof bv === 'string') {
        cmp = av.localeCompare(bv);
      }
      if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
    }
    return 0;
  };
}
