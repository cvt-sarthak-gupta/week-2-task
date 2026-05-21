import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Input, Select, Space, Modal, Tag, Tooltip } from 'antd';
import { SearchOutlined, ClearOutlined, FilterOutlined, DownloadOutlined } from '@ant-design/icons';
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
  isLoading?: boolean;
  isExporting?: boolean;
  onExport?: () => void;
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
  isLoading,
  isExporting,
  onExport,
  presetSlot,
}: FilterBarProps) {
  const [searchDraft, setSearchDraft] = useState(filters.search ?? '');
  const [builderOpen, setBuilderOpen] = useState(false);
  const [draftAst, setDraftAst] = useState<FilterNode | null>(currentFilterAst);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSearchDraft(filters.search ?? '');
  }, [filters.search]);

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
    setDraftAst(currentFilterAst);
    setBuilderOpen(true);
  };

  const handleBuilderApply = () => {
    onFilterAstChange(draftAst);
    setBuilderOpen(false);
  };

  const handleBuilderCancel = () => {
    setDraftAst(currentFilterAst);
    setBuilderOpen(false);
  };

  const hasAstFilter = !!filters.filter;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', flexWrap: 'wrap' }}>

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

        <Button
          icon={<FilterOutlined aria-hidden />}
          onClick={openBuilder}
          aria-label="Open advanced filter builder"
          type={hasAstFilter ? 'primary' : 'default'}
        >
          {hasAstFilter ? 'Edit filter' : 'Filter'}
        </Button>

        {hasActiveFilters && (
          <Button
            icon={<ClearOutlined aria-hidden />}
            onClick={onClear}
            aria-label="Clear all filters"
          >
            Clear
          </Button>
        )}

        {onExport && (
          <Tooltip title={hasActiveFilters ? 'Export filtered results to Excel' : 'Export all patients to Excel'}>
            <Button
              icon={<DownloadOutlined aria-hidden />}
              onClick={onExport}
              loading={isExporting ?? false}
              aria-label="Export to Excel"
            >
              Export
            </Button>
          </Tooltip>
        )}

        {presetSlot}

        <Space style={{ marginLeft: 'auto', fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>
          <span>
            {totalLoaded < total ? `${totalLoaded} of ${total}` : `${total}`} records
          </span>
          {isLoading && <span style={{ color: '#1677ff' }}>Loading…</span>}
        </Space>
      </div>

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
