import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act } from '@testing-library/react';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/core/offline/db/repos');
vi.mock('@/core/api/client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/core/api/tokens', () => ({ getAccessToken: vi.fn(() => 'test-token') }));
vi.mock('./orchestrator', () => ({
  runSync: vi.fn().mockResolvedValue({ updatedPatients: [], conflicts: [] }),
}));
vi.mock('./status', () => ({
  offlineStatusManager: {
    status: 'online',
    subscribe: vi.fn(),
  },
  useOfflineStatus: vi.fn(() => 'online'),
}));

// ─── Imports after mocks ───────────────────────────────────────────────────────

import { offlineStatusManager } from './status';
import { runSync } from './orchestrator';
import { getOfflineRepos } from '@/core/offline/db/repos';
import { useSyncOnReconnect } from './useSyncOnReconnect';
import { makeInMemoryDb } from '@/core/testing/makeDbClient';
import { PatientRepository } from '@/core/offline/db/repositories/PatientRepository';
import { QueueRepository } from '@/core/offline/db/repositories/QueueRepository';

const mockSubscribe = vi.mocked(offlineStatusManager.subscribe);
const mockRunSync = vi.mocked(runSync);
const mockGetOfflineRepos = vi.mocked(getOfflineRepos);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRepos() {
  const db = makeInMemoryDb();
  return { db, patientRepo: new PatientRepository(db), queueRepo: new QueueRepository(db) };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

type StatusCallback = (status: string) => void;

/** Captures the subscriber callback so tests can fire status transitions manually. */
function captureSubscriber(): { trigger: (s: string) => Promise<void> } {
  let captured: StatusCallback | null = null;
  mockSubscribe.mockImplementation((cb) => {
    captured = cb as StatusCallback;
    return () => {};
  });
  return {
    trigger: async (s: string) => {
      await act(async () => {
        if (captured) captured(s);
        // Flush microtasks so the async void IIFE inside the hook completes
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useSyncOnReconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (offlineStatusManager as { status: string }).status = 'online';
    mockRunSync.mockResolvedValue({ updatedPatients: [], conflicts: [] });
    const repos = makeRepos();
    mockGetOfflineRepos.mockResolvedValue(repos);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('subscribes to offlineStatusManager on mount', () => {
    renderHook(() => useSyncOnReconnect('tenant-a'), { wrapper });
    expect(mockSubscribe).toHaveBeenCalledOnce();
  });

  it('does not trigger sync on initial online status', async () => {
    const { trigger } = captureSubscriber();
    renderHook(() => useSyncOnReconnect('tenant-a'), { wrapper });

    // First event is online→online, not a reconnect
    await trigger('online');

    expect(mockRunSync).not.toHaveBeenCalled();
  });

  it('triggers sync when transitioning offline→online', async () => {
    const { trigger } = captureSubscriber();
    renderHook(() => useSyncOnReconnect('tenant-a'), { wrapper });

    // Go offline
    (offlineStatusManager as { status: string }).status = 'offline';
    await trigger('offline');

    // Come back online → should trigger sync
    (offlineStatusManager as { status: string }).status = 'online';
    await trigger('online');

    expect(mockRunSync).toHaveBeenCalledOnce();
  });

  it('does not trigger sync when going offline from online', async () => {
    const { trigger } = captureSubscriber();
    renderHook(() => useSyncOnReconnect('tenant-a'), { wrapper });

    (offlineStatusManager as { status: string }).status = 'online';
    await trigger('online');

    (offlineStatusManager as { status: string }).status = 'offline';
    await trigger('offline');

    expect(mockRunSync).not.toHaveBeenCalled();
  });

  it('calls onConflicts callback when sync returns conflicts', async () => {
    const conflict = {
      entry: {
        id: 'q-1', tenantId: 'tenant-a', entity: 'patient' as const, entityId: 'p-1',
        op: 'update' as const, payload: { status: 'discharged' }, createdAt: Date.now(),
        retries: 0, status: 'pending' as const,
      },
      meta: { serverVersion: 2, serverPayload: { status: 'critical' } },
    };
    mockRunSync.mockResolvedValueOnce({ updatedPatients: [], conflicts: [conflict] });

    const { trigger } = captureSubscriber();
    const onConflicts = vi.fn();
    renderHook(() => useSyncOnReconnect('tenant-a', onConflicts), { wrapper });

    (offlineStatusManager as { status: string }).status = 'offline';
    await trigger('offline');
    (offlineStatusManager as { status: string }).status = 'online';
    await trigger('online');

    expect(onConflicts).toHaveBeenCalledWith([conflict]);
  });

  it('does not call onConflicts when sync returns no conflicts', async () => {
    mockRunSync.mockResolvedValueOnce({ updatedPatients: [], conflicts: [] });

    const { trigger } = captureSubscriber();
    const onConflicts = vi.fn();
    renderHook(() => useSyncOnReconnect('tenant-a', onConflicts), { wrapper });

    (offlineStatusManager as { status: string }).status = 'offline';
    await trigger('offline');
    (offlineStatusManager as { status: string }).status = 'online';
    await trigger('online');

    expect(onConflicts).not.toHaveBeenCalled();
  });

  it('unsubscribes from offlineStatusManager on unmount', () => {
    const unsubSpy = vi.fn();
    mockSubscribe.mockImplementation(() => unsubSpy);

    const { unmount } = renderHook(() => useSyncOnReconnect('tenant-a'), { wrapper });
    unmount();

    expect(unsubSpy).toHaveBeenCalledOnce();
  });

  it('does not subscribe when tenantId is empty', () => {
    renderHook(() => useSyncOnReconnect(''), { wrapper });
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it('passes tenant-scoped dependencies to runSync', async () => {
    const { trigger } = captureSubscriber();
    renderHook(() => useSyncOnReconnect('tenant-b'), { wrapper });

    (offlineStatusManager as { status: string }).status = 'offline';
    await trigger('offline');
    (offlineStatusManager as { status: string }).status = 'online';
    await trigger('online');

    expect(mockRunSync).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-b' }),
    );
  });
});
