import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act } from '@testing-library/react';
import { makeInMemoryDb } from '@/core/testing/makeDbClient';
import { PatientRepository } from '@/core/offline/db/repositories/PatientRepository';
import { QueueRepository } from '@/core/offline/db/repositories/QueueRepository';
import type { Patient, PaginatedResult } from '@/shared/types';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/core/offline/db/repos');
vi.mock('@/core/api/client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/core/api/tokens', () => ({ getAccessToken: vi.fn(() => 'test-token') }));
vi.mock('./status', () => ({
  offlineStatusManager: { status: 'online' },
}));

// ─── Imports after mocks ───────────────────────────────────────────────────────

import { getOfflineRepos } from '@/core/offline/db/repos';
import { apiFetch } from '@/core/api/client';
import { offlineStatusManager } from './status';
import { usePatientBootstrap } from './usePatientBootstrap';

const mockGetOfflineRepos = vi.mocked(getOfflineRepos);
const mockApiFetch = vi.mocked(apiFetch);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'p-1', tenantId: 'tenant-a', mrn: 'MRN001',
    firstName: 'Alice', lastName: 'Smith', dob: '1985-04-12',
    age: 39, sex: 'F', status: 'stable', ward: 'ICU',
    assignedCoordinatorId: 'coord-1',
    admittedAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    version: 1,
    ...overrides,
  };
}

function makeRepos() {
  const db = makeInMemoryDb();
  return { db, patientRepo: new PatientRepository(db), queueRepo: new QueueRepository(db) };
}

/** Single-page result, totalPages=1 — used for viewport mock responses. */
function pageOf(patients: Patient[]): PaginatedResult<Patient> {
  return { data: patients, total: patients.length, page: 1, limit: 200, totalPages: 1 };
}

/**
 * Build a Response whose body is NDJSON — mimics the /api/patients/stream endpoint.
 * streamBootstrap uses native fetch, so tests mock globalThis.fetch directly.
 */
function ndjsonResponse(patients: Patient[], status = 200): Response {
  const ndjson = patients.map((p) => JSON.stringify(p)).join('\n') + (patients.length > 0 ? '\n' : '');
  const encoder = new TextEncoder();
  const encoded = encoder.encode(ndjson);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (encoded.length > 0) controller.enqueue(encoded);
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { 'Content-Type': 'application/x-ndjson' } });
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('usePatientBootstrap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    delete (globalThis as Record<string, unknown>).requestIdleCallback;
    delete (globalThis as Record<string, unknown>).cancelIdleCallback;
    (offlineStatusManager as { status: string }).status = 'online';
    // Default stream mock: empty NDJSON response so background stream completes immediately.
    // Individual tests override this when they need specific stream content.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse([])));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts in idle phase before effect runs', () => {
    const repos = makeRepos();
    mockGetOfflineRepos.mockResolvedValue(repos);
    mockApiFetch.mockResolvedValue(pageOf([]));

    const { result } = renderHook(() => usePatientBootstrap('tenant-a'), { wrapper });

    expect(result.current.phase).toBe('idle');
  });

  it('phase 0: skips viewport fetch when SQLite already has records', async () => {
    const repos = makeRepos();
    repos.patientRepo.upsertMany('tenant-a', [makePatient()]);
    mockGetOfflineRepos.mockResolvedValue(repos);

    renderHook(() => usePatientBootstrap('tenant-a'), { wrapper });

    await act(async () => { await vi.runAllTimersAsync(); });

    // Neither viewport (apiFetch) nor stream (fetch) should be called when SQLite has data
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('phase 1: fetches 100-row viewport on first load (empty SQLite)', async () => {
    const repos = makeRepos();
    mockGetOfflineRepos.mockResolvedValue(repos);
    mockApiFetch.mockResolvedValueOnce(
      { data: [makePatient()], total: 1, page: 1, limit: 100, totalPages: 1 },
    );

    renderHook(() => usePatientBootstrap('tenant-a'), { wrapper });

    await act(async () => { await vi.runAllTimersAsync(); });

    const viewportCall = mockApiFetch.mock.calls.find(
      (args) => (args[0] as string).includes('limit=100'),
    );
    expect(viewportCall).toBeDefined();
    expect(viewportCall![0] as string).toContain('/patients?tenantId=tenant-a');
  });

  it('writes viewport patients into SQLite', async () => {
    const repos = makeRepos();
    const patients = [
      makePatient({ id: 'p-1', updatedAt: '2024-06-01T10:00:00Z' }),
      makePatient({ id: 'p-2', updatedAt: '2024-06-02T10:00:00Z' }),
    ];
    mockGetOfflineRepos.mockResolvedValue(repos);
    mockApiFetch.mockResolvedValueOnce(
      { data: patients, total: 2, page: 1, limit: 100, totalPages: 1 },
    );

    renderHook(() => usePatientBootstrap('tenant-a'), { wrapper });

    await act(async () => { await vi.runAllTimersAsync(); });

    expect(repos.patientRepo.countByTenant('tenant-a')).toBeGreaterThanOrEqual(2);
  });

  it('commits lastSyncAt checkpoint after background stream completes', async () => {
    const repos = makeRepos();
    const now = Date.now();
    const streamPatients = [
      makePatient({ id: 'lp-1', updatedAt: new Date(now - 5000).toISOString() }),
      makePatient({ id: 'lp-2', updatedAt: new Date(now).toISOString() }),
    ];

    mockGetOfflineRepos.mockResolvedValue(repos);
    mockApiFetch.mockResolvedValueOnce(
      { data: [], total: 0, page: 1, limit: 100, totalPages: 1 }, // empty viewport
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse(streamPatients)));

    renderHook(() => usePatientBootstrap('tenant-a'), { wrapper });

    await act(async () => { await vi.runAllTimersAsync(); });

    const row = repos.db.queryOne<{ last_sync_at: number }>(
      'SELECT last_sync_at FROM sync_meta WHERE tenant_id = ?',
      ['tenant-a'],
    );
    // Checkpoint must reflect the newest updatedAt seen in the stream
    expect(row?.last_sync_at).toBe(new Date(streamPatients[1]!.updatedAt).getTime());
  });

  it('reaches complete phase when all records are streamed', async () => {
    const repos = makeRepos();
    mockGetOfflineRepos.mockResolvedValue(repos);
    mockApiFetch.mockResolvedValueOnce(
      { data: [], total: 0, page: 1, limit: 100, totalPages: 1 },
    );

    const { result } = renderHook(() => usePatientBootstrap('tenant-a'), { wrapper });

    await act(async () => { await vi.runAllTimersAsync(); });

    expect(result.current.phase).toBe('complete');
  });

  it('dispatches BATCH with running received count during stream', async () => {
    const repos = makeRepos();
    mockGetOfflineRepos.mockResolvedValue(repos);
    mockApiFetch.mockResolvedValueOnce(
      { data: [], total: 0, page: 1, limit: 100, totalPages: 1 },
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse([
      makePatient({ id: 'lp-1' }),
      makePatient({ id: 'lp-2' }),
      makePatient({ id: 'lp-3' }),
    ])));

    const { result } = renderHook(() => usePatientBootstrap('tenant-a'), { wrapper });

    await act(async () => { await vi.runAllTimersAsync(); });

    // All 3 arrive in one batch (batchSize=500); received accumulates
    expect(result.current.received).toBe(3);
    expect(result.current.phase).toBe('complete');
  });

  it('enters error phase when stream fails (non-blocking)', async () => {
    const repos = makeRepos();
    mockGetOfflineRepos.mockResolvedValue(repos);
    mockApiFetch.mockResolvedValueOnce(
      { data: [], total: 0, page: 1, limit: 100, totalPages: 1 }, // viewport ok
    );
    // Stream returns HTTP 503 — streamBootstrap throws StreamBootstrapError
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(null, { status: 503, statusText: 'Service Unavailable' }),
    ));

    const { result } = renderHook(() => usePatientBootstrap('tenant-a'), { wrapper });

    await act(async () => { await vi.runAllTimersAsync(); });

    expect(result.current.phase).toBe('error');
    expect(result.current.error?.message).toContain('503');
  });

  it('passes AbortSignal to stream fetch and aborts on unmount', async () => {
    const repos = makeRepos();
    mockGetOfflineRepos.mockResolvedValue(repos);
    mockApiFetch.mockResolvedValueOnce(
      { data: [], total: 0, page: 1, limit: 100, totalPages: 1 },
    );

    let capturedSignal: AbortSignal | undefined;

    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
      capturedSignal = opts?.signal as AbortSignal | undefined;
      return new Promise<never>(() => { /* never resolves — simulates in-flight stream */ });
    }));

    const { unmount } = renderHook(() => usePatientBootstrap('tenant-a'), { wrapper });

    await act(async () => { await vi.runAllTimersAsync(); });

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);

    act(() => { unmount(); });

    expect(capturedSignal!.aborted).toBe(true);
  });

  it('does not fetch at all when offline', async () => {
    const repos = makeRepos();
    mockGetOfflineRepos.mockResolvedValue(repos);
    (offlineStatusManager as { status: string }).status = 'offline';

    renderHook(() => usePatientBootstrap('tenant-a'), { wrapper });

    await act(async () => { await vi.runAllTimersAsync(); });

    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('uses requestIdleCallback when available', async () => {
    const repos = makeRepos();
    mockGetOfflineRepos.mockResolvedValue(repos);
    mockApiFetch.mockResolvedValueOnce(
      { data: [], total: 0, page: 1, limit: 100, totalPages: 1 },
    );

    let idleCb: (() => void) | null = null;
    const mockRequestIdleCallback = vi.fn((cb: () => void) => {
      idleCb = cb;
      return 42; // handle
    });
    const mockCancelIdleCallback = vi.fn();
    (globalThis as Record<string, unknown>).requestIdleCallback = mockRequestIdleCallback;
    (globalThis as Record<string, unknown>).cancelIdleCallback = mockCancelIdleCallback;

    const { result } = renderHook(() => usePatientBootstrap('tenant-a'), { wrapper });

    // Let getOfflineRepos resolve and the idle callback register
    await act(async () => { await vi.runAllTimersAsync(); });

    expect(mockRequestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 });

    // Now fire the idle callback manually
    await act(async () => { idleCb?.(); await vi.runAllTimersAsync(); });

    expect(result.current.phase).toBe('complete');

    // Cleanup
    delete (globalThis as Record<string, unknown>).requestIdleCallback;
    delete (globalThis as Record<string, unknown>).cancelIdleCallback;
  });

  it('calls cancelIdleCallback on unmount when requestIdleCallback is available', async () => {
    const repos = makeRepos();
    mockGetOfflineRepos.mockResolvedValue(repos);
    mockApiFetch.mockResolvedValue(pageOf([]));

    const mockRequestIdleCallback = vi.fn((_cb: () => void) => 99);
    const mockCancelIdleCallback = vi.fn();
    (globalThis as Record<string, unknown>).requestIdleCallback = mockRequestIdleCallback;
    (globalThis as Record<string, unknown>).cancelIdleCallback = mockCancelIdleCallback;

    const { unmount } = renderHook(() => usePatientBootstrap('tenant-a'), { wrapper });

    // Let the effect run and register idle callback
    await act(async () => { await vi.runAllTimersAsync(); });

    act(() => { unmount(); });

    expect(mockCancelIdleCallback).toHaveBeenCalledWith(99);

    delete (globalThis as Record<string, unknown>).requestIdleCallback;
    delete (globalThis as Record<string, unknown>).cancelIdleCallback;
  });

  it('cancelled mid-viewport does not proceed to stream phase', async () => {
    const repos = makeRepos();
    mockGetOfflineRepos.mockResolvedValue(repos);

    let resolveViewport!: (v: unknown) => void;
    const viewportPromise = new Promise((res) => { resolveViewport = res; });
    mockApiFetch.mockReturnValueOnce(viewportPromise as ReturnType<typeof mockApiFetch>);

    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const { unmount } = renderHook(() => usePatientBootstrap('tenant-a'), { wrapper });

    // Let the effect start (getOfflineRepos resolves synchronously in in-memory mode)
    await act(async () => { await vi.runAllTimersAsync(); });

    // Unmount before viewport resolves — sets cancelled = true
    act(() => { unmount(); });

    // Resolve the viewport fetch after unmount
    await act(async () => {
      resolveViewport({ data: [], total: 0, page: 1, limit: 50, totalPages: 1 });
      await vi.runAllTimersAsync();
    });

    // Stream (fetch) must NOT have started; apiFetch called at most once (viewport)
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
