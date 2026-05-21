import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeBackoff, ReconnectScheduler } from './reconnect';

describe('computeBackoff', () => {
  it('grows exponentially up to maxMs', () => {
    const config = { baseMs: 1000, maxMs: 30000, factor: 2, jitter: false };
    expect(computeBackoff(0, config)).toBe(1000);
    expect(computeBackoff(1, config)).toBe(2000);
    expect(computeBackoff(2, config)).toBe(4000);
    expect(computeBackoff(10, config)).toBe(30000); // capped
  });

  it('jitter produces values within [0, base]', () => {
    const config = { baseMs: 1000, maxMs: 30000, factor: 2, jitter: true };
    for (let i = 0; i < 100; i++) {
      const val = computeBackoff(0, config);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1000);
    }
  });
});

describe('ReconnectScheduler', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('calls fn after backoff delay', () => {
    const scheduler = new ReconnectScheduler({ baseMs: 1000, maxMs: 30000, factor: 2, jitter: false });
    const fn = vi.fn();
    scheduler.schedule(fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('increments attempt on each schedule', () => {
    const scheduler = new ReconnectScheduler({ baseMs: 1000, maxMs: 30000, factor: 2, jitter: false });
    const fn = vi.fn();
    scheduler.schedule(fn);
    vi.advanceTimersByTime(1000);
    scheduler.schedule(fn);
    expect(scheduler.currentAttempt).toBe(2);
  });

  it('reset clears attempt counter', () => {
    const scheduler = new ReconnectScheduler({ baseMs: 1000, maxMs: 30000, factor: 2, jitter: false });
    const fn = vi.fn();
    scheduler.schedule(fn);
    vi.advanceTimersByTime(1000);
    scheduler.reset();
    expect(scheduler.currentAttempt).toBe(0);
  });

  it('cancel prevents fn from being called', () => {
    const scheduler = new ReconnectScheduler({ baseMs: 1000, maxMs: 30000, factor: 2, jitter: false });
    const fn = vi.fn();
    scheduler.schedule(fn);
    scheduler.cancel();
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
  });

  it('second schedule() cancels the first — only one callback fires', () => {
    const scheduler = new ReconnectScheduler({ baseMs: 1000, maxMs: 30000, factor: 2, jitter: false });
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    scheduler.schedule(fn1); // T1 pending
    scheduler.schedule(fn2); // T1 cancelled, T2 pending
    vi.advanceTimersByTime(5000);
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalledOnce();
  });
});
