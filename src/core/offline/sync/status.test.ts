import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/core/testing/msw/server';

import { offlineStatusManager, useOfflineStatus, type OfflineStatus } from './status';

// Wait for pending async operations to complete using a real macrotask boundary.
// setTimeout(0) yields to all pending microtasks (Promise chains, MSW response
// routing) before the callback fires, making it reliable for awaiting probes.
// Only use this with real timers (vi.useRealTimers()).
function waitForAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Put the singleton into a known non-syncing state so subsequent calls to
// setSyncing() are guaranteed to be a state change (and thus notify subscribers).
function resetToOffline(): void {
  // setSyncing transitions to 'syncing' from any state (idempotent only if already syncing)
  offlineStatusManager.setSyncing(); // ensure not 'offline'
  window.dispatchEvent(new Event('offline')); // transition to 'offline'
}

beforeEach(() => {
  vi.useFakeTimers();
  offlineStatusManager.stop();
  offlineStatusManager.start();
});

afterEach(() => {
  offlineStatusManager.stop();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// subscribe / unsubscribe
// ---------------------------------------------------------------------------
describe('OfflineStatusManager — subscribe / unsubscribe', () => {
  it('subscriber is called when status changes from offline to syncing', () => {
    resetToOffline();
    const received: OfflineStatus[] = [];
    const unsub = offlineStatusManager.subscribe((s) => received.push(s));
    offlineStatusManager.setSyncing(); // offline → syncing, guaranteed change
    expect(received).toContain('syncing');
    unsub();
  });

  it('subscriber is NOT called after unsubscribing', () => {
    resetToOffline();
    const listener = vi.fn();
    const unsub = offlineStatusManager.subscribe(listener);
    unsub();
    offlineStatusManager.setSyncing(); // would fire if still subscribed
    expect(listener).not.toHaveBeenCalled();
  });

  it('multiple subscribers all receive the same change', () => {
    resetToOffline();
    const l1 = vi.fn();
    const l2 = vi.fn();
    offlineStatusManager.subscribe(l1);
    offlineStatusManager.subscribe(l2);
    offlineStatusManager.setSyncing();
    expect(l1).toHaveBeenCalledWith('syncing');
    expect(l2).toHaveBeenCalledWith('syncing');
  });

  it('unsubscribing one subscriber does not affect others', () => {
    resetToOffline();
    const l1 = vi.fn();
    const l2 = vi.fn();
    const unsub1 = offlineStatusManager.subscribe(l1);
    offlineStatusManager.subscribe(l2);
    unsub1();
    offlineStatusManager.setSyncing();
    expect(l1).not.toHaveBeenCalled();
    expect(l2).toHaveBeenCalledWith('syncing');
  });

  it('same-status change does not notify subscribers (idempotent)', () => {
    resetToOffline(); // status is now 'offline'
    const listener = vi.fn();
    offlineStatusManager.subscribe(listener);
    window.dispatchEvent(new Event('offline')); // already offline — no change
    expect(listener).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// setSyncing
// ---------------------------------------------------------------------------
describe('OfflineStatusManager — setSyncing', () => {
  it('transitions status to syncing', () => {
    resetToOffline();
    offlineStatusManager.setSyncing();
    expect(offlineStatusManager.status).toBe('syncing');
  });

  it('notifies all subscribers', () => {
    resetToOffline();
    const l1 = vi.fn();
    const l2 = vi.fn();
    offlineStatusManager.subscribe(l1);
    offlineStatusManager.subscribe(l2);
    offlineStatusManager.setSyncing();
    expect(l1).toHaveBeenCalledWith('syncing');
    expect(l2).toHaveBeenCalledWith('syncing');
  });

  it('calling setSyncing when already syncing does not re-notify', () => {
    offlineStatusManager.setSyncing(); // first call (may or may not change)
    const listener = vi.fn();
    offlineStatusManager.subscribe(listener);
    offlineStatusManager.setSyncing(); // second call — same state, no notification
    expect(listener).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// offline window event
// ---------------------------------------------------------------------------
describe('OfflineStatusManager — offline window event', () => {
  it('transitions status to offline', () => {
    offlineStatusManager.setSyncing(); // ensure non-offline start
    const received: OfflineStatus[] = [];
    offlineStatusManager.subscribe((s) => received.push(s));
    window.dispatchEvent(new Event('offline'));
    expect(offlineStatusManager.status).toBe('offline');
    expect(received).toContain('offline');
  });

  it('duplicate offline events do not re-notify', () => {
    window.dispatchEvent(new Event('offline')); // first — transitions to offline
    const listener = vi.fn();
    offlineStatusManager.subscribe(listener);
    window.dispatchEvent(new Event('offline')); // second — same state, no change
    expect(listener).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// online event + health probe (uses MSW to control /api/healthz responses)
// ---------------------------------------------------------------------------
describe('OfflineStatusManager — online event triggers health probe', () => {
  it('successful probe transitions status to online', async () => {
    vi.useRealTimers(); // real timers so async probe completes normally
    server.use(http.head('/api/healthz', () => new HttpResponse(null, { status: 200 })));

    window.dispatchEvent(new Event('offline'));
    expect(offlineStatusManager.status).toBe('offline');

    const received: OfflineStatus[] = [];
    offlineStatusManager.subscribe((s) => received.push(s));

    window.dispatchEvent(new Event('online'));
    await waitForAsync();

    expect(received).toContain('online');
    expect(offlineStatusManager.status).toBe('online');
  });

  it('failed probe (HTTP error) keeps status offline', async () => {
    vi.useRealTimers();
    server.use(http.head('/api/healthz', () => new HttpResponse(null, { status: 503 })));

    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
    await waitForAsync();

    expect(offlineStatusManager.status).toBe('offline');
  });

  it('failed probe (network error) keeps status offline', async () => {
    vi.useRealTimers();
    server.use(http.head('/api/healthz', () => HttpResponse.error()));

    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
    await waitForAsync();

    expect(offlineStatusManager.status).toBe('offline');
  });
});

// ---------------------------------------------------------------------------
// stop() removes event listeners
// ---------------------------------------------------------------------------
describe('OfflineStatusManager — stop()', () => {
  it('stop prevents window offline events from changing status', () => {
    offlineStatusManager.setSyncing(); // known non-offline state
    offlineStatusManager.stop();
    const before = offlineStatusManager.status;
    const listener = vi.fn();
    offlineStatusManager.subscribe(listener);
    window.dispatchEvent(new Event('offline'));
    expect(listener).not.toHaveBeenCalled();
    expect(offlineStatusManager.status).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// useOfflineStatus hook
// ---------------------------------------------------------------------------
describe('useOfflineStatus', () => {
  it('returns current offline status', () => {
    const { result } = renderHook(() => useOfflineStatus());
    expect(result.current).toBe(offlineStatusManager.status);
  });

  it('updates reactively when setSyncing is called', () => {
    resetToOffline();
    const { result } = renderHook(() => useOfflineStatus());

    act(() => {
      offlineStatusManager.setSyncing();
    });

    expect(result.current).toBe('syncing');
  });

  it('updates reactively when offline event fires', () => {
    offlineStatusManager.setSyncing(); // ensure non-offline start
    const { result } = renderHook(() => useOfflineStatus());

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current).toBe('offline');
  });
});
