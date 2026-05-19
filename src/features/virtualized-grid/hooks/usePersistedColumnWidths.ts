import { useCallback, useMemo, useState } from 'react';
import type { ColumnDef, ColumnWidths } from '../core/columnState';
import { applyPersistedWidths, loadColumnWidths, persistColumnWidths } from '../core/columnState';

export function usePersistedColumnWidths(cols: readonly ColumnDef[], storageKey: string) {
  const [widths, setWidths] = useState<ColumnWidths>(() =>
    applyPersistedWidths(cols, loadColumnWidths(storageKey)),
  );

  const setWidth = useCallback(
    (field: string, width: number) => {
      setWidths((prev) => {
        const next = { ...prev, [field]: Math.max(40, width) };
        persistColumnWidths(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  return { widths, setWidth };
}
