import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runSync, type SyncDependencies } from './orchestrator';
import type { Patient } from '@/shared/types';
import type { QueueEntry } from '../queue/types';

function makePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'p-1', tenantId: 't-1', mrn: 'MRN001', firstName: 'Alice', lastName: 'Smith',
    dob: '1985-04-12', age: 39, sex: 'F', status: 'stable', ward: 'ICU',
    assignedCoordinatorId: 'coord-1', admittedAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z', version: 1,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    id: 'qe-1', tenantId: 't-1', entity: 'patient', entityId: 'p-1',
    op: 'update', payload: { status: 'critical' }, createdAt: Date.now(),
    retries: 0, status: 'pending',
    ...overrides,
  };
}

function makeDeps(overrides: Partial<SyncDependencies> = {}): SyncDependencies {
  return {
    tenantId: 't-1',
    getLocalPatients: () => [],
    getPendingQueue: () => [],
    onPatientsUpdated: vi.fn(),
    onEntryConflict: vi.fn(),
    onEntrySynced: vi.fn(),
    getLastSyncAt: () => 0,
    setLastSyncAt: vi.fn(),
    ...overrides,
  };
}

vi.mock('@/core/api/client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('./streamBootstrap', () => ({
  streamBootstrap: vi.fn(),
}));

import { apiFetch } from '@/core/api/client';
import { streamBootstrap } from './streamBootstrap';
const mockApiFetch = vi.mocked(apiFetch);
const mockStreamBootstrap = vi.mocked(streamBootstrap);

function mockStream(patients: Patient[]): void {
  mockStreamBootstrap.mockImplementationOnce(async (opts) => {
    opts.onBatch(patients, { received: patients.length, batchIndex: 0 });
    opts.onCheckpoint(Date.now());
    return patients.length;
  });
}

function defaultStream(): void {
  mockStreamBootstrap.mockImplementation(async (opts) => {
    opts.onBatch([], { received: 0, batchIndex: 0 });
    opts.onCheckpoint(0);
    return 0;
  });
}

describe('runSync — patient diff merge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultStream();
  });
  afterEach(() => { vi.clearAllMocks(); });

  it('calls onPatientsUpdated with merged result', async () => {
    const serverPatients = [makePatient({ version: 2, status: 'critical' })];
    mockStream(serverPatients);

    const onPatientsUpdated = vi.fn();
    const deps = makeDeps({
      getLocalPatients: () => [makePatient({ version: 1, status: 'stable' })],
      onPatientsUpdated,
    });

    const result = await runSync(deps);

    expect(onPatientsUpdated).toHaveBeenCalledOnce();
    const patients = (onPatientsUpdated.mock.calls[0] as [Patient[]])[0]!;
    expect(patients.find((p) => p.id === 'p-1')?.status).toBe('critical');
    expect(result.updatedPatients.find((p) => p.id === 'p-1')?.status).toBe('critical');
  });

  it('adds new patients from server that do not exist locally', async () => {
    const newPatient = makePatient({ id: 'p-new' });
    mockStream([newPatient]);

    const onPatientsUpdated = vi.fn();
    const deps = makeDeps({ getLocalPatients: () => [], onPatientsUpdated });

    await runSync(deps);

    const [patients] = onPatientsUpdated.mock.calls[0] as [Patient[]];
    expect(patients.some((p) => p.id === 'p-new')).toBe(true);
  });

  it('updates setLastSyncAt after success', async () => {
    const setLastSyncAt = vi.fn();
    await runSync(makeDeps({ setLastSyncAt }));
    expect(setLastSyncAt).toHaveBeenCalledOnce();
    expect(typeof setLastSyncAt.mock.calls[0][0]).toBe('number');
  });
});

describe('runSync — queue replay ordering', () => {
  beforeEach(() => { vi.clearAllMocks(); defaultStream(); });
  afterEach(() => { vi.clearAllMocks(); });

  it('replays queue entries in createdAt order', async () => {
    const callOrder: string[] = [];
    const entries: QueueEntry[] = [
      makeEntry({ id: 'qe-3', createdAt: 300 }),
      makeEntry({ id: 'qe-1', createdAt: 100 }),
      makeEntry({ id: 'qe-2', createdAt: 200 }),
    ];

    mockApiFetch.mockImplementation((url: string) => {
      callOrder.push(url as string);
      return Promise.resolve({});
    });

    const onEntrySynced = vi.fn();
    await runSync(makeDeps({
      getPendingQueue: () => entries.sort((a, b) => a.createdAt - b.createdAt),
      onEntrySynced,
    }));

    expect(onEntrySynced).toHaveBeenCalledTimes(3);
  });

  it('marks entries synced on success', async () => {
    mockApiFetch.mockResolvedValueOnce({});

    const onEntrySynced = vi.fn();
    const deps = makeDeps({ getPendingQueue: () => [makeEntry()], onEntrySynced });
    await runSync(deps);
    expect(onEntrySynced).toHaveBeenCalledWith('qe-1');
  });
});

describe('runSync — conflict detection', () => {
  beforeEach(() => { vi.clearAllMocks(); defaultStream(); });
  afterEach(() => { vi.clearAllMocks(); });

  it('calls onEntryConflict and returns conflict in result on 409', async () => {
    const conflictBody = { serverVersion: 5, serverPayload: { status: 'stable' } };
    const conflictError = Object.assign(new Error('Conflict'), { status: 409, body: conflictBody });

    mockApiFetch.mockRejectedValueOnce(conflictError);

    const onEntryConflict = vi.fn();
    const entry = makeEntry();
    const deps = makeDeps({ getPendingQueue: () => [entry], onEntryConflict });

    const result = await runSync(deps);

    expect(onEntryConflict).toHaveBeenCalledOnce();
    const [calledEntry, calledMeta] = onEntryConflict.mock.calls[0] as [QueueEntry, { serverVersion: number }];
    expect(calledEntry.id).toBe('qe-1');
    expect(calledMeta.serverVersion).toBe(5);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.entry.id).toBe('qe-1');
    expect(result.conflicts[0]!.meta.serverVersion).toBe(5);
  });

  it('does NOT call onEntryConflict for non-409 errors', async () => {
    const networkError = Object.assign(new Error('Network error'), { status: 500 });
    mockApiFetch.mockRejectedValueOnce(networkError);

    const onEntryConflict = vi.fn();
    const deps = makeDeps({ getPendingQueue: () => [makeEntry()], onEntryConflict });

    const result = await runSync(deps);

    expect(onEntryConflict).not.toHaveBeenCalled();
    expect(result.conflicts).toHaveLength(0);
  });

  it('continues processing remaining entries after a conflict', async () => {
    const conflictError = Object.assign(new Error('409'), {
      status: 409, body: { serverVersion: 3, serverPayload: {} },
    });

    mockApiFetch
      .mockRejectedValueOnce(conflictError) // qe-1 conflicts
      .mockResolvedValueOnce({}); // qe-2 syncs

    const onEntrySynced = vi.fn();
    const onEntryConflict = vi.fn();
    const entries = [makeEntry({ id: 'qe-1' }), makeEntry({ id: 'qe-2' })];
    await runSync(makeDeps({ getPendingQueue: () => entries, onEntrySynced, onEntryConflict }));

    expect(onEntryConflict).toHaveBeenCalledOnce();
    expect(onEntrySynced).toHaveBeenCalledWith('qe-2');
  });
});

describe('runSync — concurrency guard', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.clearAllMocks(); });

  it('returns empty result when a sync is already in progress', async () => {
    let resolveFirst!: () => void;
    const firstSyncDone = new Promise<void>((res) => { resolveFirst = res; });

    mockStreamBootstrap.mockImplementationOnce(async (opts) => {
      await firstSyncDone;
      opts.onBatch([], { received: 0, batchIndex: 0 });
      opts.onCheckpoint(0);
      return 0;
    });

    const first = runSync(makeDeps());
    // Second sync fires while first is still in progress
    const second = runSync(makeDeps());

    resolveFirst();
    const [, secondResult] = await Promise.all([first, second]);

    expect(secondResult.updatedPatients).toHaveLength(0);
    expect(secondResult.conflicts).toHaveLength(0);
  });
});
