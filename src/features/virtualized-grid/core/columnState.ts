export interface ColumnDef {
  readonly field: string;
  readonly label: string;
  readonly defaultWidth: number;
  readonly frozen?: boolean;
  readonly sortable?: boolean;
  readonly resizable?: boolean;
}

export type ColumnWidths = Readonly<Record<string, number>>;

const STORAGE_KEY_PREFIX = 'hcd_col_widths';

export function persistColumnWidths(key: string, widths: ColumnWidths): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}_${key}`, JSON.stringify(widths));
  } catch {
    // localStorage may be unavailable in some environments
  }
}

export function loadColumnWidths(key: string): ColumnWidths | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}_${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as ColumnWidths;
  } catch {
    return null;
  }
}

export function applyPersistedWidths(cols: readonly ColumnDef[], persisted: ColumnWidths | null): ColumnWidths {
  const result: Record<string, number> = {};
  for (const col of cols) {
    result[col.field] = persisted?.[col.field] ?? col.defaultWidth;
  }
  return result;
}
