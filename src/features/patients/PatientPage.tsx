import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Button, Layout, Space, Spin, Typography, Alert, Badge } from 'antd';
import { LogoutOutlined, WifiOutlined } from '@ant-design/icons';
import { useAuth } from '@/core/auth/AuthContext';
import { usePatients } from './api';
import { useRealtimePatients } from './useRealtimePatients';
import { useSyncOnReconnect } from '@/core/offline/sync/useSyncOnReconnect';
import { ConflictModal, type SyncConflict } from '@/features/sync/ConflictModal';
import { usePatientFilters } from './usePatientFilters';
import { sortStateToParam, sortParamToState } from './patientFilters';
import { FilterBar } from './FilterBar';
import { Grid } from '@/features/virtualized-grid/components/Grid';
import type { ColumnDef } from '@/features/virtualized-grid/core/columnState';
import { toggleSort } from '@/features/virtualized-grid/core/sortState';
import { Gate } from '@/core/permissions/Gate';
import { useOfflineStatus } from '@/core/offline/sync/status';
import { connectionManager, type ConnectionStatus } from '@/core/realtime/connectionManager';
import { streamWorkerClient } from '@/core/workers/StreamWorkerClient';
import { useFilterWorker, buildFilterAst } from '@/core/workers/useFilterWorker';
import { mergeResults } from '@/features/filters/ast/merge';
import { PresetPanel, filtersToAst } from './presets/PresetPanel';
import { PresetConflictModal } from './presets/PresetConflictModal';
import { usePresets, useCreatePreset, useDeletePreset, useUpdatePreset } from './presets/usePresets';
import { useCan } from '@/core/permissions/useCan';
import type { FilterNode } from '@/features/filters/ast/types';
import { deserialize as deserializeFilter } from '@/features/filters/ast/serialize';

const COLUMNS: readonly ColumnDef[] = [
  { field: '__sno',     label: '#',            defaultWidth: 56,  frozen: true },
  { field: '__expand',  label: '',             defaultWidth: 36,  frozen: true },
  { field: 'mrn',       label: 'MRN',          defaultWidth: 100, frozen: true, sortable: true, resizable: true },
  { field: 'lastName',  label: 'Last Name',    defaultWidth: 140, sortable: true, resizable: true },
  { field: 'firstName', label: 'First Name',   defaultWidth: 120, sortable: true, resizable: true },
  { field: 'heartRate', label: 'HR (bpm)',     defaultWidth: 90,  resizable: true },
  { field: 'bp',        label: 'BP (mmHg)',    defaultWidth: 100, resizable: true },
  { field: 'temp',      label: 'Temp (°C)',    defaultWidth: 90,  resizable: true },
  { field: 'o2sat',     label: 'SpO2 (%)',     defaultWidth: 80,  resizable: true },
  { field: 'dob',       label: 'DOB',          defaultWidth: 110, sortable: true, resizable: true },
  { field: 'age',       label: 'Age',          defaultWidth: 70,  sortable: true, resizable: true },
  { field: 'status',    label: 'Status',       defaultWidth: 130, sortable: true, resizable: true },
  { field: 'ward',      label: 'Ward',         defaultWidth: 100, sortable: true, resizable: true },
  { field: 'admittedAt',label: 'Admitted',     defaultWidth: 140, sortable: true, resizable: true },
  { field: 'updatedAt', label: 'Last Updated', defaultWidth: 160, sortable: true, resizable: true },
];

export default function PatientPage() {
  const { user, logout } = useAuth();
  const tenantId = user?.tenantId ?? '';
  const offlineStatus = useOfflineStatus();
  const [updateTick, setUpdateTick] = useState(0);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>(connectionManager.status);

  const { filters, setFilter, setFilterAst, parsedFilterAst, clearFilters, hasActiveFilters } = usePatientFilters();
  const canShare = useCan('sharePresets');
  const userId = user?.id ?? '';
  const { data: presets = [] } = usePresets(tenantId, userId);
  const createPreset = useCreatePreset(tenantId, userId);
  const deletePreset = useDeletePreset(tenantId, userId);
  const { mutate: updatePresetMutate, conflict: presetConflict, resolveConflict, dismissConflict } = useUpdatePreset(tenantId, userId);

  const [syncConflicts, setSyncConflicts] = useState<SyncConflict[]>([]);

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = usePatients(tenantId, filters);
  useRealtimePatients(tenantId);
  useSyncOnReconnect(tenantId, setSyncConflicts);

  useEffect(() => {
    return connectionManager.onStatusChange(setConnStatus);
  }, []);

  useEffect(() => {
    return streamWorkerClient.onBatch((updates) => {
      if (updates.length > 0) setUpdateTick((t) => t + updates.length);
    });
  }, []);

  const serverRows = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;

  // Map for O(1) lookup during merge
  const localById = useMemo(
    () => new Map(serverRows.map((p) => [p.id, p])),
    [serverRows],
  );

  // Client-side filter worker result (null = no filter active / result pending)
  const [workerFilterIds, setWorkerFilterIds] = useState<ReadonlySet<string> | null>(null);
  useFilterWorker(serverRows, filters, setWorkerFilterIds);

  // Unified rows: client-filtered IDs first (instant, in-memory), then new server-only records.
  // Both sources share the same filter so there are no duplicate results.
  const rows = useMemo(() => {
    const hasFilter = buildFilterAst(filters) !== null;
    if (!hasFilter) return serverRows;
    // Worker result is still pending for this filter — show server data as-is while worker catches up
    if (workerFilterIds === null) return serverRows;
    const clientIds = Array.from(workerFilterIds).filter((id) => localById.has(id));
    return mergeResults(clientIds, serverRows, localById);
  }, [serverRows, workerFilterIds, localById, filters]);

  const sortState = useMemo(() => sortParamToState(filters.sort), [filters.sort]);

  const handleSort = useCallback((field: string) => {
    const next = toggleSort(sortState, field);
    setFilter('sort', sortStateToParam(next));
  }, [sortState, setFilter]);

  const handleNearBottom = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const handleSavePreset = useCallback((name: string, isShared: boolean) => {
    const ast = filtersToAst(filters);
    if (!ast) return;
    createPreset.mutate({ name, filterAst: ast, isShared });
  }, [filters, createPreset]);

  const handleEditPreset = useCallback(
    (id: string, patch: { name?: string; isShared?: boolean; version: number }) => {
      updatePresetMutate({ id, ...patch });
    },
    [updatePresetMutate],
  );

  const handleLoadPreset = useCallback((filterAst: string) => {
    // Single URL write — parse the stored AST and call setFilterAst once.
    // setFilterAst clears the flat params in the same URLSearchParams batch.
    try {
      const node: FilterNode = deserializeFilter(filterAst);
      setFilterAst(node);
    } catch {
      // Malformed stored AST — ignore silently
    }
  }, [setFilterAst]);

  const handleResolvePresetConflict = useCallback((resolution: import('./presets/PresetConflictModal').ConflictResolution) => {
    if (!presetConflict) return;

    if (resolution.action === 'save_as_new') {
      // Create a new preset with the user's local changes under a new name
      createPreset.mutate({
        name: resolution.name,
        filterAst: presetConflict.localPayload.filterAst,
        isShared: presetConflict.localPayload.isShared,
      });
      dismissConflict();
    } else {
      resolveConflict(resolution);
    }
  }, [presetConflict, createPreset, resolveConflict, dismissConflict]);

  // Show initial loading spinner only when there is no data yet.
  // Once the first page arrives, show results even while more are loading (isFetchingNextPage).
  if (isLoading && serverRows.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <Spin size="large" aria-label="Loading patient records..." />
      </div>
    );
  }

  if (error) {
    return <Alert type="error" message="Failed to load patients" description={String(error)} />;
  }

  const currentFilterAst = parsedFilterAst;

  return (
    <Layout style={{ height: '100vh' }}>
      <Layout.Header style={{ background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Patient Dashboard
        </Typography.Title>
        <Space>
          {offlineStatus === 'offline' && (
            <Alert type="warning" showIcon message="Offline — showing cached data" style={{ padding: '2px 12px' }} />
          )}
          {offlineStatus === 'syncing' && (
            <Alert type="info" showIcon message="Syncing..." style={{ padding: '2px 12px' }} />
          )}
          <Badge
            status={connStatus === 'connected' ? 'success' : connStatus === 'sse_fallback' ? 'warning' : connStatus === 'connecting' || connStatus === 'reconnecting' ? 'processing' : 'default'}
            text={
              <span style={{ fontSize: 12, color: '#666' }}>
                <WifiOutlined aria-hidden style={{ marginRight: 4 }} />
                {connStatus === 'connected' ? 'Live' : connStatus === 'sse_fallback' ? 'SSE' : connStatus === 'connecting' ? 'Connecting…' : connStatus === 'reconnecting' ? 'Reconnecting…' : 'Disconnected'}
              </span>
            }
            aria-label={`Connection status: ${connStatus}`}
          />
          <Button icon={<LogoutOutlined aria-hidden />} onClick={() => void logout()} aria-label="Sign out">
            Sign Out
          </Button>
        </Space>
      </Layout.Header>

      <Layout.Content style={{ padding: '0 16px 16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <FilterBar
          filters={filters}
          onFilterChange={setFilter}
          onFilterAstChange={setFilterAst}
          currentFilterAst={currentFilterAst}
          onClear={clearFilters}
          hasActiveFilters={hasActiveFilters}
          totalLoaded={rows.length}
          total={total}
          isFetchingMore={isFetchingNextPage}
          presetSlot={
            <Gate cap="managePresets">
              <PresetPanel
                tenantId={tenantId}
                userId={user?.id ?? ''}
                presets={presets}
                currentFilters={filters}
                onLoadPreset={handleLoadPreset}
                onSavePreset={handleSavePreset}
                onEditPreset={handleEditPreset}
                onDeletePreset={(id) => deletePreset.mutate(id)}
                canShare={canShare}
              />
            </Gate>
          }
        />

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Grid
            rows={rows}
            columns={COLUMNS}
            storageKey={`${tenantId}_${user?.id ?? ''}_patients`}
            recentUpdateCount={updateTick}
            onNearBottom={handleNearBottom}
            sortState={sortState}
            onSort={handleSort}
            aria-label="Patient records table"
          />
        </div>
      </Layout.Content>

      {/* Sync conflict modal (offline → online reconciliation) */}
      <ConflictModal
        conflicts={syncConflicts}
        onResolve={(entry, _resolution) => {
          setSyncConflicts((prev) => prev.filter((c) => c.entry.id !== entry.id));
        }}
        onDismiss={() => setSyncConflicts([])}
      />

      {/* Preset concurrent-edit conflict modal */}
      <PresetConflictModal
        conflict={presetConflict}
        onResolve={handleResolvePresetConflict}
        onDismiss={dismissConflict}
      />
    </Layout>
  );
}
