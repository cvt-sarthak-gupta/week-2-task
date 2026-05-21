import { memo, useRef, useEffect, useMemo, type ReactNode } from 'react';
import type { Patient } from '@/shared/types';

interface RowProps {
  index: number;
  patient: Patient;
  columns: readonly { field: string; label: string; width: number; frozen?: boolean }[];
  isExpanded: boolean;
  isSelected: boolean;
  isFocused: boolean;
  onToggleExpand: (id: string) => void;
  onSelect: (id: string) => void;
  measureRef: (el: HTMLDivElement | null) => void;
  expansionSlot?: ReactNode;
  rowIndex: number;
}

export const Row = memo(function Row({
  index,
  patient,
  columns,
  isExpanded,
  isSelected,
  isFocused,
  onToggleExpand,
  onSelect,
  measureRef,
  expansionSlot,
  rowIndex,
}: RowProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isFocused && ref.current) ref.current.focus({ preventScroll: true });
  }, [isFocused]);

  const colIndex = useMemo(
    () => new Map(columns.map((col, i) => [col.field, i + 1])),
    [columns],
  );

  const frozenCols = columns.filter((c) => c.frozen);
  const scrollCols = columns.filter((c) => !c.frozen);

  const rowBg = isSelected ? 'var(--ant-color-primary-bg)' : index % 2 === 0 ? '#fff' : '#fafafa';

  return (
    <div
      ref={(el) => {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
        measureRef(el);
      }}
      role="row"
      aria-rowindex={rowIndex}
      aria-selected={isSelected}
      aria-expanded={isExpanded}
      tabIndex={isFocused ? 0 : -1}
      data-row-id={patient.id}
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: rowBg,
        borderBottom: '1px solid #f0f0f0',
        cursor: 'pointer',
        outline: isFocused ? '2px solid var(--ant-color-primary)' : 'none',
      }}
      onClick={() => onSelect(patient.id)}
    >
      <div style={{ display: 'flex' }}>
        <div style={{ display: 'flex', position: 'sticky', left: 0, zIndex: 1, background: rowBg, boxShadow: '3px 0 6px -2px rgba(0,0,0,0.18)' }}>
          {frozenCols.map((col) => (
            <div
              key={col.field}
              role="gridcell"
              aria-colindex={colIndex.get(col.field)}
              style={{ width: col.width, padding: '8px 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {renderCell(patient, col.field, () => onToggleExpand(patient.id), isExpanded, index)}
            </div>
          ))}
        </div>
        {scrollCols.map((col) => (
          <div
            key={col.field}
            role="gridcell"
            aria-colindex={colIndex.get(col.field)}
            style={{ width: col.width, padding: '8px 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {renderCell(patient, col.field, () => onToggleExpand(patient.id), isExpanded, index)}
          </div>
        ))}
      </div>

      {isExpanded && expansionSlot}
    </div>
  );
});

function renderCell(patient: Patient, field: string, onExpand: () => void, isExpanded: boolean, index: number): ReactNode {
  if (field === '__sno') {
    return <span style={{ color: '#8c8c8c', fontSize: 12 }}>{index + 1}</span>;
  }
  if (field === '__expand') {
    return (
      <button
        type="button"
        aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
        onClick={(e) => { e.stopPropagation(); onExpand(); }}
      >
        {isExpanded ? '▼' : '▶'}
      </button>
    );
  }
  if (field === 'status') {
    return <StatusBadge status={patient.status} />;
  }
  if (field === 'heartRate' || field === 'temp' || field === 'o2sat' || field === 'bp') {
    const val = (patient as unknown as Record<string, unknown>)[field];
    return <span style={{ color: val == null ? '#bfbfbf' : undefined }}>{val == null ? '—' : String(val)}</span>;
  }
  return String((patient as unknown as Record<string, unknown>)[field] ?? '');
}

const STATUS_CONFIG = {
  critical:   { icon: '🔴', label: 'Critical',   color: '#ff4d4f' },
  stable:     { icon: '🟢', label: 'Stable',     color: '#52c41a' },
  discharged: { icon: '⚪', label: 'Discharged', color: '#8c8c8c' },
  pending:    { icon: '🟡', label: 'Pending',    color: '#faad14' },
  admitted:   { icon: '🔵', label: 'Admitted',   color: '#1677ff' },
} as const;

function StatusBadge({ status }: { status: Patient['status'] }) {
  const config = STATUS_CONFIG[status];
  return (
    <span style={{ color: config.color, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span aria-hidden="true">{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}
