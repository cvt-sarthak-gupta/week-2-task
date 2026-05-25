import { useCallback, useRef } from 'react';
import { CaretUpOutlined, CaretDownOutlined } from '@ant-design/icons';
import type { ColumnDef } from '../core/columnState';
import type { SortState } from '../core/sortState';
import { getSortPriority } from '../core/sortState';

interface HeaderRowProps {
  columns: readonly ColumnDef[];
  widths: Readonly<Record<string, number>>;
  sortState: SortState;
  onSort: (field: string) => void;
  onResize: (field: string, width: number) => void;
}

export function HeaderRow({ columns, widths, sortState, onSort, onResize }: HeaderRowProps) {
  const resizingRef = useRef<{ field: string; startX: number; startWidth: number } | null>(null);

  const handleMouseDown = useCallback(
    (field: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startWidth = widths[field] ?? 100;
      resizingRef.current = { field, startX: e.clientX, startWidth };

      const onMove = (ev: MouseEvent) => {
        if (!resizingRef.current) return;
        const delta = ev.clientX - resizingRef.current.startX;
        onResize(resizingRef.current.field, resizingRef.current.startWidth + delta);
      };

      const onUp = () => {
        resizingRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [widths, onResize],
  );

  const frozenCols = columns.filter((c) => c.frozen);
  const scrollCols = columns.filter((c) => !c.frozen);

  const renderHeader = (col: ColumnDef) => {
    const priority = getSortPriority(sortState, col.field);
    const entry = sortState.find((s) => s.field === col.field);
    return (
      <div
        key={col.field}
        role="columnheader"
        aria-sort={entry ? (entry.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        style={{
          width: widths[col.field] ?? col.defaultWidth,
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          userSelect: 'none',
          flexShrink: 0,
          fontWeight: 600,
          borderBottom: '2px solid #f0f0f0',
          position: 'relative',
          cursor: col.sortable ? 'pointer' : 'default',
          background: '#fafafa',
        }}
        onClick={() => col.sortable && onSort(col.field)}
        tabIndex={col.sortable ? 0 : -1}
        onKeyDown={(e) => e.key === 'Enter' && col.sortable && onSort(col.field)}
      >
        {col.label
          ? <span>{col.label}</span>
          : <span style={{ position: 'absolute', width: 1, height: 1, padding: 0, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
              {col.field === '__expand' ? 'Expand or collapse row' : col.field}
            </span>
        }
        {col.sortable && entry && (
          <>
            {entry.dir === 'asc' ? <CaretUpOutlined aria-hidden /> : <CaretDownOutlined aria-hidden />}
            {sortState.length > 1 && (
              <sup aria-label={`Sort priority ${priority}`} style={{ fontSize: 10, color: '#888' }}>
                {priority}
              </sup>
            )}
          </>
        )}
        <div
          role="separator"
          aria-label={col.resizable ? `Resize ${col.label} column` : undefined}
          aria-orientation="vertical"
          style={{
            position: 'absolute',
            right: 0,
            top: '20%',
            bottom: '20%',
            width: col.resizable ? 4 : 1,
            cursor: col.resizable ? 'col-resize' : 'default',
            background: col.resizable ? '#bfbfbf' : '#e0e0e0',
            borderRadius: 2,
            zIndex: 1,
            transition: 'background 0.15s',
          }}
          onMouseDown={col.resizable ? (e) => handleMouseDown(col.field, e) : undefined}
          onClick={col.resizable ? (e) => e.stopPropagation() : undefined}
          onMouseEnter={col.resizable ? (e) => { (e.currentTarget as HTMLDivElement).style.background = '#595959'; } : undefined}
          onMouseLeave={col.resizable ? (e) => { (e.currentTarget as HTMLDivElement).style.background = '#bfbfbf'; } : undefined}
        />
      </div>
    );
  };

  return (
    <div role="row" style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 3, background: '#fafafa' }}>
      <div style={{ display: 'flex', position: 'sticky', left: 0, zIndex: 4, background: '#fafafa', boxShadow: '3px 0 6px -2px rgba(0,0,0,0.18)' }}>
        {frozenCols.map(renderHeader)}
      </div>
      {scrollCols.map(renderHeader)}
    </div>
  );
}
