import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { LiveRegion } from './liveRegion';
import { Row } from '../components/Row';
import { HeaderRow } from '../components/HeaderRow';
import { Grid } from '../components/Grid';
import type { Patient } from '@/shared/types';
import type { ColumnDef } from '../core/columnState';


beforeAll(() => {
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PATIENT: Patient = {
  id: 'p-1',
  tenantId: 'tenant-a',
  mrn: 'MRN000001',
  firstName: 'Jane',
  lastName: 'Doe',
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

const COLUMNS: readonly ColumnDef[] = [
  { field: '__expand', label: '',       defaultWidth: 40,  frozen: true },
  { field: 'mrn',     label: 'MRN',    defaultWidth: 120, frozen: true, sortable: true, resizable: true },
  { field: 'status',  label: 'Status', defaultWidth: 120, sortable: true },
  { field: 'ward',    label: 'Ward',   defaultWidth: 120, sortable: true },
];

const ROW_COLS = COLUMNS.map((c) => ({ ...c, width: c.defaultWidth }));

// ─── LiveRegion ───────────────────────────────────────────────────────────────

describe('LiveRegion — accessibility', () => {
  it('has aria-live="polite" and aria-atomic="true"', () => {
    const { container } = render(<LiveRegion updateCount={0} />);
    const region = container.querySelector('[aria-live]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-live')).toBe('polite');
    expect(region?.getAttribute('aria-atomic')).toBe('true');
  });

  it('announces the update count after the 1-second debounce', async () => {
    vi.useFakeTimers();
    render(<LiveRegion updateCount={3} />);

    expect(screen.queryByText(/updated/i)).toBeNull();

    await act(async () => { vi.advanceTimersByTime(1_100); });
    expect(screen.getByText('3 patient records updated')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('uses singular "record" when exactly one update arrives', async () => {
    vi.useFakeTimers();
    render(<LiveRegion updateCount={1} />);
    await act(async () => { vi.advanceTimersByTime(1_100); });
    expect(screen.getByText('1 patient record updated')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('accumulates rapid-fire updates into one announcement', async () => {
    vi.useFakeTimers();
    const { rerender } = render(<LiveRegion updateCount={2} />);
    rerender(<LiveRegion updateCount={5} />);
    await act(async () => { vi.advanceTimersByTime(1_100); });
    expect(screen.getByText('7 patient records updated')).toBeInTheDocument();
    vi.useRealTimers();
  });
});

// ─── Row ─────────────────────────────────────────────────────────────────────

describe('Row — ARIA attributes', () => {
  it('has role="row", aria-rowindex, aria-selected, aria-expanded', () => {
    render(
      <Row
        index={0}
        patient={PATIENT}
        columns={ROW_COLS}
        isExpanded={false}
        isSelected={true}
        isFocused={false}
        onToggleExpand={vi.fn()}
        onSelect={vi.fn()}
        measureRef={vi.fn()}
        rowIndex={1}
      />,
    );
    const row = screen.getByRole('row');
    expect(row).toHaveAttribute('aria-rowindex', '1');
    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(row).toHaveAttribute('aria-expanded', 'false');
  });

  it('each cell carries role="gridcell" and a sequential aria-colindex', () => {
    render(
      <Row
        index={0}
        patient={PATIENT}
        columns={ROW_COLS}
        isExpanded={false}
        isSelected={false}
        isFocused={false}
        onToggleExpand={vi.fn()}
        onSelect={vi.fn()}
        measureRef={vi.fn()}
        rowIndex={1}
      />,
    );
    const cells = screen.getAllByRole('gridcell');
    expect(cells.length).toBe(ROW_COLS.length);
    cells.forEach((cell, i) => {
      expect(cell).toHaveAttribute('aria-colindex', String(i + 1));
    });
  });

  it('expand button has an accessible aria-label that reflects collapsed state', () => {
    render(
      <Row
        index={0}
        patient={PATIENT}
        columns={ROW_COLS}
        isExpanded={false}
        isSelected={false}
        isFocused={false}
        onToggleExpand={vi.fn()}
        onSelect={vi.fn()}
        measureRef={vi.fn()}
        rowIndex={1}
      />,
    );
    expect(screen.getByRole('button', { name: /expand row/i })).toBeInTheDocument();
  });

  it('expand button label switches to "Collapse row" when expanded', () => {
    render(
      <Row
        index={0}
        patient={PATIENT}
        columns={ROW_COLS}
        isExpanded={true}
        isSelected={false}
        isFocused={false}
        onToggleExpand={vi.fn()}
        onSelect={vi.fn()}
        measureRef={vi.fn()}
        rowIndex={1}
      />,
    );
    expect(screen.getByRole('button', { name: /collapse row/i })).toBeInTheDocument();
  });

  it('StatusBadge renders a visible text label alongside the icon — color is not the only indicator', () => {
    render(
      <Row
        index={0}
        patient={{ ...PATIENT, status: 'critical' }}
        columns={ROW_COLS}
        isExpanded={false}
        isSelected={false}
        isFocused={false}
        onToggleExpand={vi.fn()}
        onSelect={vi.fn()}
        measureRef={vi.fn()}
        rowIndex={1}
      />,
    );
    // "Critical" text must appear so status is not conveyed by color alone
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });
});

// ─── HeaderRow ────────────────────────────────────────────────────────────────

describe('HeaderRow — ARIA attributes', () => {
  it('sortable columns start with aria-sort="none"', () => {
    render(
      <HeaderRow
        columns={COLUMNS}
        widths={{}}
        sortState={[]}
        onSort={vi.fn()}
        onResize={vi.fn()}
      />,
    );
    const mrnHeader = screen.getByRole('columnheader', { name: /mrn/i });
    expect(mrnHeader).toHaveAttribute('aria-sort', 'none');
  });

  it('reflects ascending sort direction in aria-sort', () => {
    render(
      <HeaderRow
        columns={COLUMNS}
        widths={{}}
        sortState={[{ field: 'mrn', dir: 'asc' }]}
        onSort={vi.fn()}
        onResize={vi.fn()}
      />,
    );
    expect(screen.getByRole('columnheader', { name: /mrn/i })).toHaveAttribute('aria-sort', 'ascending');
  });

  it('reflects descending sort direction in aria-sort', () => {
    render(
      <HeaderRow
        columns={COLUMNS}
        widths={{}}
        sortState={[{ field: 'mrn', dir: 'desc' }]}
        onSort={vi.fn()}
        onResize={vi.fn()}
      />,
    );
    expect(screen.getByRole('columnheader', { name: /mrn/i })).toHaveAttribute('aria-sort', 'descending');
  });

  it('multi-sort priority badge has an aria-label', () => {
    render(
      <HeaderRow
        columns={COLUMNS}
        widths={{}}
        sortState={[{ field: 'mrn', dir: 'asc' }, { field: 'status', dir: 'desc' }]}
        onSort={vi.fn()}
        onResize={vi.fn()}
      />,
    );
    expect(screen.getByRole('superscript', { name: /sort priority 1/i })).toBeInTheDocument();
  });

  it('resize handle has an aria-label describing which column it resizes', () => {
    render(
      <HeaderRow
        columns={COLUMNS}
        widths={{}}
        sortState={[]}
        onSort={vi.fn()}
        onResize={vi.fn()}
      />,
    );
    expect(screen.getByRole('separator', { name: /resize mrn column/i })).toBeInTheDocument();
  });
});

// ─── Full Grid — axe audit ────────────────────────────────────────────────────

describe('Grid — axe accessibility audit', () => {
  it('has no axe violations on an empty grid', async () => {
    const { container } = render(
      <Grid
        rows={[]}
        totalCount={0}
        columns={COLUMNS}
        storageKey="a11y-test-empty"
        aria-label="Patient records table"
      />,
    );
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } }, // jsdom has no CSS rendering
    });
    const violations = results.violations
      .map((v) => `${v.id}: ${v.description}`)
      .join('\n');
    expect(violations).toBe('');
  });

  it('grid container has role="grid", aria-label, and aria-rowcount', () => {
    const { container } = render(
      <Grid
        rows={[PATIENT]}
        totalCount={1}
        columns={COLUMNS}
        storageKey="a11y-test-one-row"
        aria-label="Patient records table"
      />,
    );
    const grid = container.querySelector('[role="grid"]');
    expect(grid).toHaveAttribute('aria-label', 'Patient records table');
    expect(grid).toHaveAttribute('aria-rowcount', '1');
  });

  it('grid is focusable via keyboard (tabIndex=0)', () => {
    const { container } = render(
      <Grid
        rows={[]}
        totalCount={0}
        columns={COLUMNS}
        storageKey="a11y-test-focus"
      />,
    );
    const grid = container.querySelector('[role="grid"]');
    expect(grid).toHaveAttribute('tabindex', '0');
  });
});
