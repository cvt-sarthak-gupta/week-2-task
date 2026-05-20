import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useVisibleColumns, useIsWidgetVisible, useIsActionVisible } from './useLayout';
import { PermissionProvider } from './PermissionProvider';
import type { PermissionSchema } from './schema';
import type { ColumnDef } from '@/features/virtualized-grid/core/columnState';

const ALL_COLUMNS: readonly ColumnDef[] = [
  { field: 'mrn',    label: 'MRN',    defaultWidth: 100 },
  { field: 'status', label: 'Status', defaultWidth: 130 },
  { field: 'ward',   label: 'Ward',   defaultWidth: 100 },
];

const makeSchema = (layout: PermissionSchema['layout']): PermissionSchema => ({
  capabilities: ['viewPatients'],
  featureFlags: {
    analyticsWidget: false,
    exportFeature: false,
    advancedFilters: false,
    offlineSupport: false,
    presetSharing: false,
  },
  layout,
});

function wrapper(schema: PermissionSchema) {
  return ({ children }: { children: ReactNode }) => (
    <PermissionProvider schema={schema}>{children}</PermissionProvider>
  );
}

const emptyLayout: PermissionSchema['layout'] = { visibleColumns: [], sideWidgets: [], actionBar: [] };

describe('useVisibleColumns', () => {
  it('returns all columns when visibleColumns is empty (unconfigured)', () => {
    const { result } = renderHook(() => useVisibleColumns(ALL_COLUMNS), {
      wrapper: wrapper(makeSchema(emptyLayout)),
    });
    expect(result.current).toEqual(ALL_COLUMNS);
  });

  it('filters out columns marked visible: false', () => {
    const schema = makeSchema({
      ...emptyLayout,
      visibleColumns: [
        { field: 'mrn',    visible: true,  label: 'MRN' },
        { field: 'status', visible: false, label: 'Status' },
        { field: 'ward',   visible: true,  label: 'Ward' },
      ],
    });
    const { result } = renderHook(() => useVisibleColumns(ALL_COLUMNS), { wrapper: wrapper(schema) });
    expect(result.current.map((c) => c.field)).toEqual(['mrn', 'ward']);
  });

  it('keeps columns not present in the config (visible by default)', () => {
    const schema = makeSchema({
      ...emptyLayout,
      visibleColumns: [{ field: 'mrn', visible: false, label: 'MRN' }],
    });
    const { result } = renderHook(() => useVisibleColumns(ALL_COLUMNS), { wrapper: wrapper(schema) });
    // status and ward absent from config → visible
    expect(result.current.map((c) => c.field)).toEqual(['status', 'ward']);
  });

  it('returns empty array when all columns are hidden', () => {
    const schema = makeSchema({
      ...emptyLayout,
      visibleColumns: [
        { field: 'mrn',    visible: false, label: 'MRN' },
        { field: 'status', visible: false, label: 'Status' },
        { field: 'ward',   visible: false, label: 'Ward' },
      ],
    });
    const { result } = renderHook(() => useVisibleColumns(ALL_COLUMNS), { wrapper: wrapper(schema) });
    expect(result.current).toHaveLength(0);
  });
});

describe('useIsWidgetVisible', () => {
  it('returns true when sideWidgets is empty (unconfigured — show all)', () => {
    const { result } = renderHook(() => useIsWidgetVisible('presets'), {
      wrapper: wrapper(makeSchema(emptyLayout)),
    });
    expect(result.current).toBe(true);
  });

  it('returns true when widget is in the configured list', () => {
    const schema = makeSchema({ ...emptyLayout, sideWidgets: ['presets', 'alerts'] });
    const { result } = renderHook(() => useIsWidgetVisible('presets'), { wrapper: wrapper(schema) });
    expect(result.current).toBe(true);
  });

  it('returns false when widget is absent from the configured list', () => {
    const schema = makeSchema({ ...emptyLayout, sideWidgets: ['alerts'] });
    const { result } = renderHook(() => useIsWidgetVisible('presets'), { wrapper: wrapper(schema) });
    expect(result.current).toBe(false);
  });
});

describe('useIsActionVisible', () => {
  it('returns true when actionBar is empty (unconfigured — show all)', () => {
    const { result } = renderHook(() => useIsActionVisible('export'), {
      wrapper: wrapper(makeSchema(emptyLayout)),
    });
    expect(result.current).toBe(true);
  });

  it('returns true when action is in the configured list', () => {
    const schema = makeSchema({ ...emptyLayout, actionBar: ['export', 'discharge'] });
    const { result } = renderHook(() => useIsActionVisible('export'), { wrapper: wrapper(schema) });
    expect(result.current).toBe(true);
  });

  it('returns false when action is absent from the configured list', () => {
    const schema = makeSchema({ ...emptyLayout, actionBar: ['discharge'] });
    const { result } = renderHook(() => useIsActionVisible('export'), { wrapper: wrapper(schema) });
    expect(result.current).toBe(false);
  });
});
