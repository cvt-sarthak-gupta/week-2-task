import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Input, Select, Space, Modal, Tag, Tooltip } from 'antd';
import { SearchOutlined, ClearOutlined, FilterOutlined } from '@ant-design/icons';
import type { PatientFilters } from './patientFilters';
import { PATIENT_STATUSES, PATIENT_WARDS } from './patientFilters';
import { FilterBuilder } from '@/features/filters/FilterBuilder';
import type { FilterNode } from '@/features/filters/ast/types';

interface FilterBarProps {
  filters: PatientFilters;
  onFilterChange: <K extends keyof PatientFilters>(key: K, value: PatientFilters[K]) => void;
  onFilterAstChange: (node: FilterNode | null) => void;
  currentFilterAst: FilterNode | null;
  onClear: () => void;
  hasActiveFilters: boolean;
  totalLoaded: number;
  total: number;
  isFetchingMore?: boolean;
  presetSlot?: ReactNode;
}

const STATUS_LABELS: Record<string, string> = {
  critical:   'Critical',
  stable:     'Stable',
  admitted:   'Admitted',
  pending:    'Pending',
  discharged: 'Discharged',
};

export function FilterBar({
  filters,
  onFilterChange,
  onFilterAstChange,
  currentFilterAst,
  onClear,
  hasActiveFilters,
  totalLoaded,
  total,
  isFetchingMore,
  presetSlot,
}: FilterBarProps) {
  const [searchDraft, setSearchDraft] = useState(filters.search ?? '');
  const [builderOpen, setBuilderOpen] = useState(false);
  // Local draft — only committed to URL when the user clicks "Apply"
  const [draftAst, setDraftAst] = useState<FilterNode | null>(currentFilterAst);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep search draft in sync with URL (e.g. after Clear All or preset load)
  useEffect(() => {
    setSearchDraft(filters.search ?? '');
  }, [filters.search]);

  // Keep builder draft in sync when the applied filter changes externally
  // (Clear All, preset load, browser back/forward)
  useEffect(() => {
    setDraftAst(currentFilterAst);
  }, [currentFilterAst]);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchDraft(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onFilterChange('search', value || undefined);
      }, 400);
    },
    [onFilterChange],
  );

  const openBuilder = () => {
    // Always start the draft from the currently applied filter
    setDraftAst(currentFilterAst);
    setBuilderOpen(true);
  };

  const handleBuilderApply = () => {
    onFilterAstChange(draftAst);
    setBuilderOpen(false);
  };

  const handleBuilderCancel = () => {
    // Discard draft, restore to applied state
    setDraftAst(currentFilterAst);
    setBuilderOpen(false);
  };

  const hasAstFilter = !!filters.filter;

  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Filter bar row                                                    */}
      {/* ---------------------------------------------------------------- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', flexWrap: 'wrap' }}>

        {/* Simple filters — hidden while an advanced AST filter is active */}
        {!hasAstFilter && (
          <Input
            allowClear
            prefix={<SearchOutlined aria-hidden />}
            placeholder="Search name or MRN…"
            value={searchDraft}
            onChange={(e) => handleSearchChange(e.target.value)}
            style={{ width: 220 }}
            aria-label="Search patients"
          />
        )}

        {!hasAstFilter && (
          <Select
            allowClear
            placeholder="Status"
            value={filters.status ?? null}
            onChange={(v) => onFilterChange('status', v ?? undefined)}
            style={{ width: 140 }}
            aria-label="Filter by status"
            options={PATIENT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s }))}
          />
        )}

        {!hasAstFilter && (
          <Select
            allowClear
            placeholder="Ward"
            value={filters.ward ?? null}
            onChange={(v) => onFilterChange('ward', v ?? undefined)}
            style={{ width: 140 }}
            aria-label="Filter by ward"
            options={PATIENT_WARDS.map((w) => ({ value: w, label: w }))}
          />
        )}

        {/* Indicator shown when an advanced AST filter is active */}
        {hasAstFilter && (
          <Tooltip title="Advanced filter active — click to edit">
            <Tag
              color="blue"
              style={{ cursor: 'pointer', fontSize: 12, padding: '2px 8px' }}
              onClick={openBuilder}
            >
              <FilterOutlined style={{ marginRight: 4 }} />
              Advanced filter active
            </Tag>
          </Tooltip>
        )}

        {/* Advanced filter builder button */}
        <Button
          icon={<FilterOutlined aria-hidden />}
          onClick={openBuilder}
          aria-label="Open advanced filter builder"
          type={hasAstFilter ? 'primary' : 'default'}
        >
          {hasAstFilter ? 'Edit filter' : 'Filter'}
        </Button>

        {/* Clear all active filters */}
        {hasActiveFilters && (
          <Button
            icon={<ClearOutlined aria-hidden />}
            onClick={onClear}
            aria-label="Clear all filters"
          >
            Clear
          </Button>
        )}

        {presetSlot}

        <Space style={{ marginLeft: 'auto', fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>
          <span>
            {totalLoaded < total ? `${totalLoaded} of ${total}` : `${total}`} records
          </span>
          {isFetchingMore && <span style={{ color: '#1677ff' }}>Loading more…</span>}
        </Space>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Advanced filter builder — Modal (fully controlled, no trigger     */}
      {/* conflict)                                                         */}
      {/* ---------------------------------------------------------------- */}
      <Modal
        title="Advanced filter builder"
        open={builderOpen}
        onCancel={handleBuilderCancel}
        width={620}
        destroyOnClose={false}
        footer={
          <Space>
            <Button onClick={() => { onFilterAstChange(null); setDraftAst(null); setBuilderOpen(false); }}>
              Clear filter
            </Button>
            <Button onClick={handleBuilderCancel}>Cancel</Button>
            <Button type="primary" onClick={handleBuilderApply}>
              Apply filter
            </Button>
          </Space>
        }
      >
        <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
          <FilterBuilder value={draftAst} onChange={setDraftAst} />
        </div>
      </Modal>
    </>
  );
}
