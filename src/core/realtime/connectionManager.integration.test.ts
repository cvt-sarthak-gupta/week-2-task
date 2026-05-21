import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock stream worker client to isolate connectionManager from Worker setup
vi.mock('@/core/workers/StreamWorkerClient', () => ({
  streamWorkerClient: { sendEvent: vi.fn() },
}));
vi.mock('@/core/api/tokens', () => ({
  getAccessToken: vi.fn(() => 'fresh-token'),
}));
// SseTransport and WebSocketTransport are mocked so tests can control transport instances
vi.mock('./transport/SseTransport');
vi.mock('./transport/WebSocketTransport');

import { ConnectionManager } from './connectionManager';
import type { ITransport, TransportState } from './transport/ITransport';
import { streamWorkerClient } from '@/core/workers/StreamWorkerClient';
import { SseTransport } from './transport/SseTransport';
import { WebSocketTransport } from './transport/WebSocketTransport';
import { getAccessToken } from '@/core/api/tokens';

const mockSendEvent = vi.mocked(streamWorkerClient.sendEvent);

/** Minimal controllable transport that lets tests fire state/message events manually. */
function makeControllableTransport(name: 'websocket' | 'sse' = 'websocket'): ITransport & {
  fireState(s: TransportState): void;
  fireMessage(raw: string): void;
} {
  const messageCbs = new Set<(raw: string) => void>();
  const stateCbs = new Set<(s: TransportState) => void>();
  let _state: TransportState = 'disconnected';

  return {
    name,
    get state() { return _state; },
    open: vi.fn(),
    close: vi.fn(),
    send: vi.fn(),
    onMessage(cb) { messageCbs.add(cb); return () => messageCbs.delete(cb); },
    onStateChange(cb) { stateCbs.add(cb); return () => stateCbs.delete(cb); },
    fireState(s: TransportState) {
      _state = s;
      stateCbs.forEach((cb) => cb(s));
    },
    fireMessage(raw: string) {
      messageCbs.forEach((cb) => cb(raw));
    },
  };
}

describe('ConnectionManager — connect/disconnect lifecycle', () => {
  let manager: ConnectionManager;
  let wsTx: ReturnType<typeof makeControllableTransport>;

  beforeEach(() => {
    vi.useFakeTimers();
    wsTx = makeControllableTransport('websocket');
    manager = new ConnectionManager(wsTx as ITransport);
  });

  afterEach(() => {
    manager.disconnect();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('starts idle', () => {
    expect(manager.status).toBe('idle');
  });

  it('transitions to connecting on connect()', () => {
    manager.connect('ws://localhost', 'token');
    expect(manager.status).toBe('connecting');
    expect(wsTx.open).toHaveBeenCalledWith('ws://localhost', 'token');
  });

  it('transitions to connected when transport fires connected', () => {
    manager.connect('ws://localhost', 'token');
    wsTx.fireState('connected');
    expect(manager.status).toBe('connected');
  });

  it('notifies status listeners', () => {
    const listener = vi.fn();
    manager.onStatusChange(listener);
    manager.connect('ws://localhost', 'token');
    wsTx.fireState('connected');
    expect(listener).toHaveBeenCalledWith('connecting');
    expect(listener).toHaveBeenCalledWith('connected');
  });

  it('unsubscribes status listener when returned function is called', () => {
    const listener = vi.fn();
    const unsub = manager.onStatusChange(listener);
    unsub();
    manager.connect('ws://localhost', 'token');
    expect(listener).not.toHaveBeenCalled();
  });

  it('transitions to idle on disconnect()', () => {
    manager.connect('ws://localhost', 'token');
    wsTx.fireState('connected');
    manager.disconnect();
    expect(manager.status).toBe('idle');
  });

  it('forwards data events to streamWorkerClient', () => {
    manager.connect('ws://localhost', 'token');
    wsTx.fireState('connected');

    const event = JSON.stringify({
      type: 'status_changed', id: 'evt-1', entityId: 'p-1', version: 1, ts: Date.now(),
      payload: { previousStatus: 'stable', newStatus: 'critical' },
    });
    wsTx.fireMessage(event);
    expect(mockSendEvent).toHaveBeenCalledOnce();
    expect(mockSendEvent.mock.calls[0]![0]).toMatchObject({ type: 'status_changed' });
  });

  it('discards pong messages without forwarding to worker', () => {
    manager.connect('ws://localhost', 'token');
    wsTx.fireState('connected');
    wsTx.fireMessage(JSON.stringify({ type: 'pong', ts: Date.now() }));
    expect(mockSendEvent).not.toHaveBeenCalled();
  });

  it('discards malformed JSON without throwing', () => {
    manager.connect('ws://localhost', 'token');
    wsTx.fireState('connected');
    expect(() => wsTx.fireMessage('not json')).not.toThrow();
    expect(mockSendEvent).not.toHaveBeenCalled();
  });
});

describe('ConnectionManager — heartbeat', () => {
  let manager: ConnectionManager;
  let wsTx: ReturnType<typeof makeControllableTransport>;

  beforeEach(() => {
    vi.useFakeTimers();
    wsTx = makeControllableTransport('websocket');
    manager = new ConnectionManager(wsTx as ITransport);
  });

  afterEach(() => {
    manager.disconnect();
    vi.useRealTimers();
  });

  it('sends a ping every 15 seconds after connection', () => {
    manager.connect('ws://localhost', 'token');
    wsTx.fireState('connected');

    vi.advanceTimersByTime(15_000);
    expect(wsTx.send).toHaveBeenCalledOnce();
    const msg = JSON.parse((wsTx.send as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string) as { type: string };
    expect(msg.type).toBe('ping');
  });

  it('does NOT close connection when pong is received within 5 seconds', () => {
    manager.connect('ws://localhost', 'token');
    wsTx.fireState('connected');

    vi.advanceTimersByTime(15_000); // trigger ping
    wsTx.fireMessage(JSON.stringify({ type: 'pong', ts: Date.now() }));
    vi.advanceTimersByTime(5_000); // pong timeout window passes — should be cleared

    expect(wsTx.close).not.toHaveBeenCalled();
    expect(manager.status).toBe('connected');
  });

  it('closes transport when no pong received within 5 seconds', () => {
    manager.connect('ws://localhost', 'token');
    wsTx.fireState('connected');

    vi.advanceTimersByTime(15_000); // ping
    vi.advanceTimersByTime(5_001); // pong timeout fires

    expect(wsTx.close).toHaveBeenCalled();
    expect(manager.status).toBe('reconnecting');
  });

  it('uses refreshed token on heartbeat-timeout reconnect when getAccessToken returns a value', () => {
    manager.connect('ws://localhost', 'original-token');
    wsTx.fireState('connected');

    vi.mocked(getAccessToken).mockReturnValueOnce('refreshed-token');
    vi.advanceTimersByTime(15_000); // ping sent
    vi.advanceTimersByTime(5_001); // pong timeout fires → transport.close() + reconnect.schedule()
    // Advance past the reconnect backoff (max first-attempt jitter = 1000ms) but not
    // far enough to fire the heartbeat interval again (would need ~9s more).
    vi.advanceTimersByTime(1_001);
    expect(wsTx.open).toHaveBeenLastCalledWith('ws://localhost', 'refreshed-token');
  });

  it('keeps existing token when getAccessToken returns null on heartbeat-timeout reconnect', () => {
    manager.connect('ws://localhost', 'original-token');
    wsTx.fireState('connected');

    vi.mocked(getAccessToken).mockReturnValueOnce(null as unknown as string);
    vi.advanceTimersByTime(15_000); // ping sent
    vi.advanceTimersByTime(5_001); // pong timeout fires → reconnect.schedule()
    vi.advanceTimersByTime(1_001); // reconnect callback fires — getAccessToken returned null
    // token should remain 'original-token' since fresh was falsy
    expect(wsTx.open).toHaveBeenLastCalledWith('ws://localhost', 'original-token');
  });
});

describe('ConnectionManager — SSE fallback', () => {
  let manager: ConnectionManager;
  let sseTx: ReturnType<typeof makeControllableTransport>;
  let wsTx2: ReturnType<typeof makeControllableTransport>;

  beforeEach(() => {
    vi.useFakeTimers();
    sseTx = makeControllableTransport('sse');
    wsTx2 = makeControllableTransport('websocket');
    vi.mocked(WebSocketTransport).mockImplementation(() => wsTx2 as unknown as InstanceType<typeof WebSocketTransport>);
    manager = new ConnectionManager(sseTx as ITransport, true /* usingSse */);
  });

  afterEach(() => {
    manager.disconnect();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows sse_fallback status when transport connects', () => {
    manager.connect('http://localhost/sse', 'token');
    sseTx.fireState('connected');
    expect(manager.status).toBe('sse_fallback');
    expect(manager.transportName).toBe('sse');
  });

  it('does NOT send heartbeat pings over SSE', () => {
    manager.connect('http://localhost/sse', 'token');
    sseTx.fireState('connected');
    vi.advanceTimersByTime(60_000); // well past the 15s heartbeat interval
    expect(sseTx.send).not.toHaveBeenCalled();
  });

  it('schedules reconnect when SSE fires disconnected', () => {
    manager.connect('http://localhost/sse', 'token');
    sseTx.fireState('connected');
    sseTx.fireState('disconnected');
    expect(manager.status).toBe('reconnecting');
  });

  it('schedules reconnect when SSE fires failed', () => {
    manager.connect('http://localhost/sse', 'token');
    sseTx.fireState('connected');
    sseTx.fireState('failed');
    expect(manager.status).toBe('reconnecting');
  });

  it('re-attempts WebSocket (not SSE) when reconnecting from SSE fallback', () => {
    manager.connect('ws://localhost', 'token');
    sseTx.fireState('connected');
    sseTx.fireState('disconnected');

    vi.advanceTimersByTime(1_001);
    expect(manager.transportName).toBe('websocket');
    // getAccessToken mock returns 'fresh-token', so reconnect uses the refreshed token
    expect(wsTx2.open).toHaveBeenCalledWith('ws://localhost', 'fresh-token');
  });

  it('uses fresh token when re-upgrading to WebSocket after SSE fallback', () => {
    manager.connect('ws://localhost', 'token');
    sseTx.fireState('connected');

    vi.mocked(getAccessToken).mockReturnValueOnce('new-token');
    sseTx.fireState('disconnected');

    vi.advanceTimersByTime(1_001);
    expect(wsTx2.open).toHaveBeenCalledWith('ws://localhost', 'new-token');
  });
});

describe('ConnectionManager — SSE fallback activation from WS failure', () => {
  let manager: ConnectionManager;
  let wsTx: ReturnType<typeof makeControllableTransport>;
  let sseTx: ReturnType<typeof makeControllableTransport>;
  let wsTx2: ReturnType<typeof makeControllableTransport>;

  beforeEach(() => {
    vi.useFakeTimers();
    sseTx = makeControllableTransport('sse');
    vi.mocked(SseTransport).mockImplementation(() => sseTx as unknown as InstanceType<typeof SseTransport>);
    wsTx2 = makeControllableTransport('websocket');
    vi.mocked(WebSocketTransport).mockImplementation(() => wsTx2 as unknown as InstanceType<typeof WebSocketTransport>);
    wsTx = makeControllableTransport('websocket');
    manager = new ConnectionManager(wsTx as ITransport);
  });

  afterEach(() => {
    manager.disconnect();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('switches transport to SSE and sets sse_fallback status when WS fires failed (code 1008)', () => {
    manager.connect('ws://localhost', 'token');
    wsTx.fireState('failed');
    expect(manager.transportName).toBe('sse');
    expect(manager.status).toBe('sse_fallback');
  });

  it('reconnects to WebSocket (not SSE) when WS fires disconnected (network drop)', () => {
    manager.connect('ws://localhost', 'token');
    wsTx.fireState('connected');
    wsTx.fireState('disconnected');
    expect(manager.status).toBe('reconnecting');
    vi.advanceTimersByTime(1_001);
    // Should reopen the same WebSocket transport, not switch to SSE
    expect(manager.transportName).toBe('websocket');
    expect(wsTx.open).toHaveBeenCalledTimes(2); // initial connect + reconnect
    expect(vi.mocked(SseTransport)).not.toHaveBeenCalled();
  });

  it('opens SSE on the same URL used for WS', () => {
    manager.connect('ws://localhost/stream', 'my-token');
    wsTx.fireState('failed');
    expect(sseTx.open).toHaveBeenCalledWith('ws://localhost/stream', 'my-token');
  });

  it('events received over SSE after the switch reach the stream worker (data continuity)', () => {
    manager.connect('ws://localhost', 'token');

    // Event received over WS before the failure
    const wsEvent = JSON.stringify({
      type: 'status_changed', id: 'evt-ws-1', entityId: 'p-1', version: 1, ts: Date.now(),
      payload: { previousStatus: 'stable', newStatus: 'critical' },
    });
    wsTx.fireState('connected');
    wsTx.fireMessage(wsEvent);
    expect(mockSendEvent).toHaveBeenCalledTimes(1);

    // WS drops — switches to SSE
    wsTx.fireState('failed');

    // Event received over SSE after the switch
    const sseEvent = JSON.stringify({
      type: 'status_changed', id: 'evt-sse-1', entityId: 'p-2', version: 1, ts: Date.now(),
      payload: { previousStatus: 'admitted', newStatus: 'stable' },
    });
    sseTx.fireMessage(sseEvent);
    expect(mockSendEvent).toHaveBeenCalledTimes(2);
    expect(mockSendEvent.mock.calls[1]![0]).toMatchObject({ type: 'status_changed', entityId: 'p-2' });
  });

  it('does not send heartbeat pings after switching to SSE', () => {
    manager.connect('ws://localhost', 'token');
    wsTx.fireState('connected');
    wsTx.fireState('failed'); // triggers switch to SSE
    sseTx.fireState('connected');
    vi.advanceTimersByTime(60_000);
    expect(sseTx.send).not.toHaveBeenCalled();
  });

  it('re-attempts WebSocket when SSE drops after a fallback, then falls back to SSE again if WS fails', () => {
    // WS fails → SSE fallback
    manager.connect('ws://localhost', 'token');
    wsTx.fireState('failed');
    sseTx.fireState('connected');
    expect(manager.status).toBe('sse_fallback');

    // SSE drops → reconnect should try WS again
    sseTx.fireState('disconnected');
    expect(manager.status).toBe('reconnecting');
    vi.advanceTimersByTime(1_001);

    expect(manager.transportName).toBe('websocket');
    // getAccessToken mock returns 'fresh-token', so reconnect uses the refreshed token
    expect(wsTx2.open).toHaveBeenCalledWith('ws://localhost', 'fresh-token');

    // WS fails again → falls back to SSE once more
    wsTx2.fireState('failed');
    expect(manager.transportName).toBe('sse');
    expect(manager.status).toBe('sse_fallback');
  });
});
