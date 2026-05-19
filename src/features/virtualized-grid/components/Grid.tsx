import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Patient } from '@/shared/types';
import type { ColumnDef } from '../core/columnState';
import type { SortState } from '../core/sortState';
import { useVirtualizer } from '../hooks/useVirtualizer';
import { usePersistedColumnWidths } from '../hooks/usePersistedColumnWidths';
import { useKeyboardNavigation } from '../hooks/useKeyboardNavigation';
import { HeaderRow } from './HeaderRow';
import { Row } from './Row';
import { LiveRegion } from '../a11y/liveRegion';

interface GridProps {
  rows: readonly Patient[];
  columns: readonly ColumnDef[];
  storageKey: string;
  recentUpdateCount?: number;
  onNearBottom?: () => void;
  // Sort is controlled externally (API-level)
  sortState?: SortState;
  onSort?: (field: string) => void;
  'aria-label'?: string;
}

export function Grid({
  rows,
  columns,
  storageKey,
  recentUpdateCount = 0,
  onNearBottom,
  sortState = [],
  onSort,
  'aria-label': ariaLabel = 'Patient records',
}: GridProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { widths, setWidth } = usePersistedColumnWidths(columns, storageKey);

  const { containerRef, totalHeight, visibleRange, measureRow, scrollToIndex } = useVirtualizer({
    count: rows.length,
    defaultRowHeight: 48,
    overscan: 5,
  });

  const handleSort = useCallback((field: string) => {
    onSort?.(field);
    scrollToIndex(0, 'auto');
  }, [onSort, scrollToIndex]);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const { handleKeyDown, focusedIndexRef } = useKeyboardNavigation({
    rowCount: rows.length,
    onExpand: (idx) => { const p = rows[idx]; if (p) handleToggleExpand(p.id); },
    onSelect: (idx) => { const p = rows[idx]; if (p) handleSelect(p.id); },
    scrollToIndex,
  });

  const enrichedColumns = useMemo(
    () => columns.map((col) => ({ ...col, width: widths[col.field] ?? col.defaultWidth })),
    [columns, widths],
  );

  const { startIndex, endIndex, offsetY } = visibleRange;

  useEffect(() => {
    if (onNearBottom && rows.length > 0 && endIndex >= rows.length - 50) {
      onNearBottom();
    }
  }, [endIndex, rows.length, onNearBottom]);

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <LiveRegion updateCount={recentUpdateCount} />
      <div
        ref={containerRef}
        role="grid"
        aria-label={ariaLabel}
        aria-rowcount={rows.length}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{ flex: 1, overflow: 'auto', outline: 'none', position: 'relative' }}
      >
        {/* Header inside scroll container so horizontal scroll keeps header/body aligned */}
        <HeaderRow
          columns={enrichedColumns}
          widths={widths}
          sortState={sortState}
          onSort={handleSort}
          onResize={setWidth}
        />
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ position: 'absolute', top: offsetY, left: 0, right: 0 }}>
            {rows.slice(startIndex, endIndex).map((patient, relIdx) => {
              const absIdx = startIndex + relIdx;
              return (
                <Row
                  key={patient.id}
                  index={absIdx}
                  patient={patient}
                  columns={enrichedColumns}
                  isExpanded={expandedIds.has(patient.id)}
                  isSelected={selectedIds.has(patient.id)}
                  isFocused={focusedIndexRef.current === absIdx}
                  onToggleExpand={handleToggleExpand}
                  onSelect={handleSelect}
                  measureRef={(el) => measureRow(absIdx, el)}
                  rowIndex={absIdx + 1}
                  expansionSlot={
                    expandedIds.has(patient.id) ? (
                      <div style={{ padding: '12px 24px', background: '#f9f9f9', borderTop: '1px solid #eee' }}>
                        <strong>Notes:</strong> {patient.notes ?? 'No notes available.'}
                      </div>
                    ) : undefined
                  }
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
