import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  totalCount?: number;
  columns: readonly ColumnDef[];
  storageKey: string;
  recentUpdateCount?: number;
  onNearBottom?: () => void;
  /** Rows from the end at which onNearBottom fires. Defaults to 20. */
  nearBottomThreshold?: number;
  /** When this value changes the grid scrolls back to the top (e.g. on filter change). */
  scrollResetKey?: string;
  // Sort is controlled externally (API-level)
  sortState?: SortState;
  onSort?: (field: string) => void;
  'aria-label'?: string;
}

export function Grid({
  rows,
  totalCount,
  columns,
  storageKey,
  recentUpdateCount = 0,
  onNearBottom,
  nearBottomThreshold = 20,
  scrollResetKey,
  sortState = [],
  onSort,
  'aria-label': ariaLabel = 'Patient records',
}: GridProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { widths, setWidth } = usePersistedColumnWidths(columns, storageKey);

  // Use totalCount (server total) if available so the scroll container represents the
  // full dataset — not just the currently loaded slice. Unloaded rows render as
  // skeletons and trigger fetchNextPage when they scroll into view.
  const virtualizerCount = (totalCount != null && totalCount > rows.length) ? totalCount : rows.length;

  const { containerRef, totalHeight, visibleRange, measureRow, scrollToIndex } = useVirtualizer({
    count: virtualizerCount,
    defaultRowHeight: 48,
    overscan: 5,
  });

  const handleSort = useCallback((field: string) => {
    onSort?.(field);
    scrollToIndex(0, 'auto');
  }, [onSort, scrollToIndex]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    scrollToIndex(0, 'auto');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollResetKey]);

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
    rowCount: virtualizerCount,
    onExpand: (idx) => { const p = rows[idx]; if (p) handleToggleExpand(p.id); },
    onSelect: (idx) => { const p = rows[idx]; if (p) handleSelect(p.id); },
    scrollToIndex,
  });

  const enrichedColumns = useMemo(
    () => columns.map((col) => ({ ...col, width: widths[col.field] ?? col.defaultWidth })),
    [columns, widths],
  );

  const { startIndex, endIndex, offsetY } = visibleRange;

  // Keep a ref to rows.length so the near-bottom effect reads the latest value
  // without subscribing to it. Subscribing causes an infinite cascade: each new
  // page load changes rows.length → effect fires → fetchNextPage → new page →
  // rows.length changes again. Scroll events change endIndex, so that's the
  // only dep we actually need to trigger the check.
  const rowsLengthRef = useRef(rows.length);
  rowsLengthRef.current = rows.length;

  useEffect(() => {
    if (onNearBottom && rowsLengthRef.current > 0 && endIndex >= rowsLengthRef.current - nearBottomThreshold) {
      onNearBottom();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endIndex, onNearBottom]);

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <LiveRegion updateCount={recentUpdateCount} />
      <div
        ref={containerRef}
        role="grid"
        aria-label={ariaLabel}
        aria-rowcount={virtualizerCount}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{ flex: 1, minHeight: 0, overflow: 'auto', outline: 'none', position: 'relative' }}
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
            {Array.from({ length: endIndex - startIndex }, (_, relIdx) => {
              const absIdx = startIndex + relIdx;
              const patient = rows[absIdx];

              // Unloaded row — show a lightweight skeleton so the scroll position is
              // preserved and the fetch-next-page effect has time to load real data.
              if (!patient) {
                return (
                  <div
                    key={`skeleton-${absIdx}`}
                    role="row"
                    aria-rowindex={absIdx + 1}
                    aria-busy="true"
                    style={{
                      height: 48,
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 16px',
                      borderBottom: '1px solid #f0f0f0',
                      background: absIdx % 2 === 0 ? '#fff' : '#fafafa',
                    }}
                  >
                    <div style={{ width: '60%', height: 12, background: '#e8e8e8', borderRadius: 6 }} />
                  </div>
                );
              }

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
