import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { Grid } from './Grid';
import type { Patient } from '@/shared/types';
import type { ColumnDef } from '../core/columnState';

beforeAll(() => {
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

const COLUMNS: readonly ColumnDef[] = [
  { field: 'mrn', label: 'MRN', defaultWidth: 120, frozen: true, sortable: true },
  { field: 'lastName', label: 'Last Name', defaultWidth: 160, sortable: true },
  { field: 'status', label: 'Status', defaultWidth: 120, sortable: true },
  { field: 'ward', label: 'Ward', defaultWidth: 120, sortable: true },
];

function makePatient(i: number): Patient {
  return {
    id: `p-${i}`,
    tenantId: 'tenant-a',
    mrn: `MRN${String(i).padStart(6, '0')}`,
    firstName: 'Jane',
    lastName: `Patient${i}`,
    dob: '1980-06-15',
    age: 44,
    sex: 'F',
    status: 'stable',
    ward: 'A1',
    assignedCoordinatorId: 'coord-1',
    admittedAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    version: 1,
  };
}

describe('Grid component — render performance', () => {
  it('mounts with 50,000 rows within 200ms', () => {
    const rows: Patient[] = Array.from({ length: 50_000 }, (_, i) => makePatient(i));

    const t0 = performance.now();
    const { container } = render(
      <Grid
        rows={rows}
        totalCount={50_000}
        columns={COLUMNS}
        storageKey="perf-test"
      />,
    );
    const elapsed = performance.now() - t0;

    expect(container.querySelector('[role="grid"]')).not.toBeNull();
    expect(elapsed).toBeLessThan(200);
  });
});
