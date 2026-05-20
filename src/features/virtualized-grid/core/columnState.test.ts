import { describe, it, expect, beforeEach } from 'vitest';
import {
  persistColumnWidths,
  loadColumnWidths,
  applyPersistedWidths,
  type ColumnDef,
  type ColumnWidths,
} from './columnState';

const COLUMNS: readonly ColumnDef[] = [
  { field: 'mrn', label: 'MRN', defaultWidth: 100 },
  { field: 'status', label: 'Status', defaultWidth: 130 },
  { field: 'ward', label: 'Ward', defaultWidth: 100 },
  { field: 'name', label: 'Name', defaultWidth: 200, frozen: true, resizable: true },
];

beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// persistColumnWidths
// ---------------------------------------------------------------------------
describe('persistColumnWidths', () => {
  it('writes widths to localStorage under a prefixed key', () => {
    const widths: ColumnWidths = { mrn: 100, status: 150 };
    persistColumnWidths('patient-grid', widths);
    const raw = localStorage.getItem('hcd_col_widths_patient-grid');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual(widths);
  });

  it('overwrites a previous entry with the same key', () => {
    persistColumnWidths('k', { mrn: 100 });
    persistColumnWidths('k', { mrn: 200 });
    const raw = localStorage.getItem('hcd_col_widths_k');
    expect(JSON.parse(raw!)).toEqual({ mrn: 200 });
  });

  it('different keys do not interfere with each other', () => {
    persistColumnWidths('grid-a', { mrn: 100 });
    persistColumnWidths('grid-b', { mrn: 200 });
    expect(JSON.parse(localStorage.getItem('hcd_col_widths_grid-a')!)).toEqual({ mrn: 100 });
    expect(JSON.parse(localStorage.getItem('hcd_col_widths_grid-b')!)).toEqual({ mrn: 200 });
  });

  it('does not throw when localStorage is unavailable', () => {
    const origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    expect(() => persistColumnWidths('key', { mrn: 100 })).not.toThrow();
    localStorage.setItem = origSetItem;
  });
});

// ---------------------------------------------------------------------------
// loadColumnWidths
// ---------------------------------------------------------------------------
describe('loadColumnWidths', () => {
  it('returns null when no entry exists', () => {
    expect(loadColumnWidths('nonexistent')).toBeNull();
  });

  it('returns the persisted widths object', () => {
    const widths: ColumnWidths = { mrn: 120, status: 160, ward: 90 };
    persistColumnWidths('my-grid', widths);
    expect(loadColumnWidths('my-grid')).toEqual(widths);
  });

  it('returns null when the stored value is malformed JSON', () => {
    localStorage.setItem('hcd_col_widths_bad', 'not-json{{');
    expect(loadColumnWidths('bad')).toBeNull();
  });

  it('returns null when the entry was cleared', () => {
    persistColumnWidths('k', { mrn: 100 });
    localStorage.clear();
    expect(loadColumnWidths('k')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// applyPersistedWidths
// ---------------------------------------------------------------------------
describe('applyPersistedWidths', () => {
  it('uses defaultWidth for all columns when no persisted widths', () => {
    const result = applyPersistedWidths(COLUMNS, null);
    expect(result['mrn']).toBe(100);
    expect(result['status']).toBe(130);
    expect(result['ward']).toBe(100);
    expect(result['name']).toBe(200);
  });

  it('merges persisted widths over defaults', () => {
    const persisted: ColumnWidths = { mrn: 150, status: 200 };
    const result = applyPersistedWidths(COLUMNS, persisted);
    expect(result['mrn']).toBe(150);
    expect(result['status']).toBe(200);
    expect(result['ward']).toBe(100); // no persisted value → default
  });

  it('includes every column in the result', () => {
    const result = applyPersistedWidths(COLUMNS, null);
    expect(Object.keys(result)).toEqual(COLUMNS.map((c) => c.field));
  });

  it('persisted key for a column not in current definition is ignored', () => {
    const persisted: ColumnWidths = { mrn: 120, deletedColumn: 99 };
    const result = applyPersistedWidths(COLUMNS, persisted);
    expect('deletedColumn' in result).toBe(false);
  });

  it('empty column list returns empty object', () => {
    const result = applyPersistedWidths([], { mrn: 100 });
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('partial persisted object fills remaining from defaults', () => {
    const persisted: ColumnWidths = { name: 300 };
    const result = applyPersistedWidths(COLUMNS, persisted);
    expect(result['name']).toBe(300);
    expect(result['mrn']).toBe(100);
    expect(result['status']).toBe(130);
    expect(result['ward']).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: persist → load → apply
// ---------------------------------------------------------------------------
describe('columnState — persist / load / apply round-trip', () => {
  it('round-trip preserves all column widths', () => {
    const original: ColumnWidths = { mrn: 140, status: 180, ward: 90, name: 250 };
    persistColumnWidths('round-trip', original);
    const loaded = loadColumnWidths('round-trip');
    const applied = applyPersistedWidths(COLUMNS, loaded);
    expect(applied).toEqual(original);
  });
});
