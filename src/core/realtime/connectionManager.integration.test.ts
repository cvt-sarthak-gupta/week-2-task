import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock stream worker client to isolate connectionManager from Worker setup
vi.mock('@/core/workers/StreamWorkerClient', () => ({
  streamWorkerClient: { sendEvent: vi.fn() },
}));
vi.mock('@/core/api/tokens', () => ({
  getAccessToken: vi.fn(() => 'fresh-token'),
}));
// SseTransport is mocked so tests can control the SSE transport instance
vi.mock('./transport/SseTransport');

import { ConnectionManager } from './connectionManager';
import type { ITransport, TransportState } from './transport/ITransport';
import { streamWorkerClient } from '@/core/workers/StreamWorkerClient';
import { SseTransport } from './transport/SseTransport';

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
    expect(mockSendEvent.mock.calls[0][0]).toMatchObject({ type: 'status_changed' });
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
    const msg = JSON.parse((wsTx.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string) as { type: string };
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
});

describe('ConnectionManager — SSE fallback', () => {
  let manager: ConnectionManager;
  let sseTx: ReturnType<typeof makeControllableTransport>;

  beforeEach(() => {
    vi.useFakeTimers();
    sseTx = makeControllableTransport('sse');
    manager = new ConnectionManager(sseTx as ITransport, true /* usingSse */);
  });

  afterEach(() => {
    manager.disconnect();
    vi.useRealTimers();
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
});

describe('ConnectionManager — SSE fallback activation from WS failure', () => {
  let manager: ConnectionManager;
  let wsTx: ReturnType<typeof makeControllableTransport>;
  let sseTx: ReturnType<typeof makeControllableTransport>;

  beforeEach(() => {
    vi.useFakeTimers();
    sseTx = makeControllableTransport('sse');
    vi.mocked(SseTransport).mockImplementation(() => sseTx as unknown as InstanceType<typeof SseTransport>);
    wsTx = makeControllableTransport('websocket');
    manager = new ConnectionManager(wsTx as ITransport);
  });

  afterEach(() => {
    manager.disconnect();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('switches transport to SSE and sets sse_fallback status when WS fires failed', () => {
    manager.connect('ws://localhost', 'token');
    wsTx.fireState('failed');
    expect(manager.transportName).toBe('sse');
    expect(manager.status).toBe('sse_fallback');
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
    expect(mockSendEvent.mock.calls[1][0]).toMatchObject({ type: 'status_changed', entityId: 'p-2' });
  });

  it('does not send heartbeat pings after switching to SSE', () => {
    manager.connect('ws://localhost', 'token');
    wsTx.fireState('connected');
    wsTx.fireState('failed'); // triggers switch to SSE
    sseTx.fireState('connected');
    vi.advanceTimersByTime(60_000);
    expect(sseTx.send).not.toHaveBeenCalled();
  });
});
