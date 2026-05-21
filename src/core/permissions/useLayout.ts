import { useMemo } from 'react';
import { usePermissions } from './PermissionProvider';
import type { ColumnDef } from '@/features/virtualized-grid/core/columnState';

export function useVisibleColumns(allColumns: readonly ColumnDef[]): readonly ColumnDef[] {
  const { schema } = usePermissions();
  return useMemo(() => {
    const { visibleColumns } = schema.layout;
    if (visibleColumns.length === 0) return allColumns;
    const visibilityMap = new Map(visibleColumns.map((c) => [c.field, c.visible]));
    return allColumns.filter((col) => {
      const v = visibilityMap.get(col.field);
      return v === undefined ? true : v;
    });
  }, [allColumns, schema.layout]);
}

export function useIsWidgetVisible(widgetId: string): boolean {
  const { schema } = usePermissions();
  const { sideWidgets } = schema.layout;
  if (sideWidgets.length === 0) return true;
  return sideWidgets.includes(widgetId);
}

export function useIsActionVisible(actionId: string): boolean {
  const { schema } = usePermissions();
  const { actionBar } = schema.layout;
  if (actionBar.length === 0) return true;
  return actionBar.includes(actionId);
}
