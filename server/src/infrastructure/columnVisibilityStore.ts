export interface ColumnConfig {
  field: string;
  label: string;
  visible: boolean;
}

// All data columns that admins can show or hide.
// Internal grid columns (__sno, __expand) are omitted — they are always rendered.
export const ALL_COLUMNS: Omit<ColumnConfig, 'visible'>[] = [
  { field: 'mrn',        label: 'MRN' },
  { field: 'lastName',   label: 'Last Name' },
  { field: 'firstName',  label: 'First Name' },
  { field: 'status',     label: 'Status' },
  { field: 'ward',       label: 'Ward' },
  { field: 'heartRate',  label: 'HR (bpm)' },
  { field: 'bp',         label: 'BP (mmHg)' },
  { field: 'temp',       label: 'Temp (°C)' },
  { field: 'o2sat',      label: 'SpO2 (%)' },
  { field: 'dob',        label: 'DOB' },
  { field: 'age',        label: 'Age' },
  { field: 'admittedAt', label: 'Admitted' },
  { field: 'updatedAt',  label: 'Last Updated' },
];

// Per-role default visibility.
// readonly users see a trimmed-down clinical view by default.
const ROLE_DEFAULTS: Record<string, Record<string, boolean>> = {
  readonly: Object.fromEntries(
    ALL_COLUMNS.map((c) => [
      c.field,
      ['mrn', 'lastName', 'firstName', 'status', 'ward'].includes(c.field),
    ]),
  ),
};

function defaultForRole(role: string): Record<string, boolean> {
  return (
    ROLE_DEFAULTS[role] ??
    Object.fromEntries(ALL_COLUMNS.map((c) => [c.field, true]))
  );
}

// Store keyed by `${tenantId}::${role}`
const store = new Map<string, Record<string, boolean>>();

function storeKey(tenantId: string, role: string): string {
  return `${tenantId}::${role}`;
}

export function getColumnsForRole(tenantId: string, role: string): ColumnConfig[] {
  const key = storeKey(tenantId, role);
  const overrides = store.get(key) ?? {};
  const defaults = defaultForRole(role);
  return ALL_COLUMNS.map((col) => ({
    ...col,
    visible: overrides[col.field] ?? defaults[col.field] ?? true,
  }));
}

export function clearColumnsForRole(tenantId: string, role: string): void {
  store.delete(storeKey(tenantId, role));
}

export function setColumnsForRole(
  tenantId: string,
  role: string,
  patch: Record<string, boolean>,
): ColumnConfig[] {
  const key = storeKey(tenantId, role);
  const defaults = defaultForRole(role);
  const current = store.get(key) ?? { ...defaults };
  const updated: Record<string, boolean> = { ...current };
  for (const field of ALL_COLUMNS.map((c) => c.field)) {
    if (patch[field] !== undefined) updated[field] = patch[field]!;
  }
  store.set(key, updated);
  return getColumnsForRole(tenantId, role);
}
