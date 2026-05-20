import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketTransport } from './WebSocketTransport';

// ---------------------------------------------------------------------------
// Minimal mock WebSocket that lets tests control open/close/message/error
// ---------------------------------------------------------------------------
interface MockWsInstance {
  url: string;
  readyState: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send: ReturnType<typeof vi.fn<any[], any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  close: ReturnType<typeof vi.fn<any[], any>>;
  onopen: ((e: Event) => void) | null;
  onclose: ((e: { code: number }) => void) | null;
  onerror: ((e: Event) => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  simulateOpen(): void;
  simulateMessage(data: string): void;
  simulateClose(code?: number): void;
  simulateError(): void;
}

const wsInstances: MockWsInstance[] = [];

class MockWebSocket implements MockWsInstance {
  static OPEN = 1;
  url: string;
  readyState = 0;
  onopen: ((e: Event) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send = vi.fn() as ReturnType<typeof vi.fn<any[], any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  close = vi.fn((code = 1000) => { this.readyState = 3; this.onclose?.({ code }); }) as ReturnType<typeof vi.fn<any[], any>>;

  constructor(url: string) {
    this.url = url;
    wsInstances.push(this);
  }

  simulateOpen() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: string) {
    this.onmessage?.({ data });
  }

  simulateClose(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code });
  }

  simulateError() {
    this.readyState = 3;
    this.onerror?.(new Event('error'));
  }
}

beforeEach(() => {
  wsInstances.length = 0;
  vi.stubGlobal('WebSocket', MockWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------
describe('WebSocketTransport — state transitions', () => {
  it('starts in disconnected state', () => {
    const t = new WebSocketTransport();
    expect(t.state).toBe('disconnected');
  });

  it('open() moves state to connecting', () => {
    const t = new WebSocketTransport();
    t.open('ws://localhost', 'tok');
    expect(t.state).toBe('connecting');
  });

  it('onopen fires → state becomes connected', () => {
    const t = new WebSocketTransport();
    t.open('ws://localhost', 'tok');
    wsInstances[0]!.simulateOpen();
    expect(t.state).toBe('connected');
  });

  it('onclose fires (non-1008) → state becomes disconnected', () => {
    const t = new WebSocketTransport();
    t.open('ws://localhost', 'tok');
    wsInstances[0]!.simulateOpen();
    wsInstances[0]!.simulateClose(1006);
    expect(t.state).toBe('disconnected');
  });

  it('onclose fires with code 1008 → state becomes failed', () => {
    const t = new WebSocketTransport();
    t.open('ws://localhost', 'tok');
    wsInstances[0]!.simulateOpen();
    wsInstances[0]!.simulateClose(1008);
    expect(t.state).toBe('failed');
  });

  it('onerror fires → state becomes failed', () => {
    const t = new WebSocketTransport();
    t.open('ws://localhost', 'tok');
    wsInstances[0]!.simulateError();
    expect(t.state).toBe('failed');
  });

  it('close() moves state to disconnected', () => {
    const t = new WebSocketTransport();
    t.open('ws://localhost', 'tok');
    wsInstances[0]!.simulateOpen();
    t.close();
    expect(t.state).toBe('disconnected');
  });

  it('close() calls underlying ws.close with code 1000', () => {
    const t = new WebSocketTransport();
    t.open('ws://localhost', 'tok');
    const ws = wsInstances[0]!;
    t.close();
    expect(ws.close).toHaveBeenCalledWith(1000, 'client_close');
  });
});

// ---------------------------------------------------------------------------
// URL construction
// ---------------------------------------------------------------------------
describe('WebSocketTransport — URL construction', () => {
  it('appends token as query param to the URL', () => {
    const t = new WebSocketTransport();
    t.open('ws://localhost/stream', 'my-token');
    expect(wsInstances[0]!.url).toBe('ws://localhost/stream?token=my-token');
  });

  it('percent-encodes special chars in the token', () => {
    const t = new WebSocketTransport();
    t.open('ws://localhost', 'tok=n/val');
    expect(wsInstances[0]!.url).toBe('ws://localhost?token=tok%3Dn%2Fval');
  });
});

// ---------------------------------------------------------------------------
// Message callbacks
// ---------------------------------------------------------------------------
describe('WebSocketTransport — message callbacks', () => {
  it('onMessage callback receives data from the server', () => {
    const t = new WebSocketTransport();
    const received: string[] = [];
    t.onMessage((raw) => received.push(raw));
    t.open('ws://localhost', 'tok');
    wsInstances[0]!.simulateOpen();
    wsInstances[0]!.simulateMessage('{"type":"ping"}');
    expect(received).toEqual(['{"type":"ping"}']);
  });

  it('multiple onMessage subscribers all receive the message', () => {
    const t = new WebSocketTransport();
    const l1 = vi.fn();
    const l2 = vi.fn();
    t.onMessage(l1);
    t.onMessage(l2);
    t.open('ws://localhost', 'tok');
    wsInstances[0]!.simulateMessage('hello');
    expect(l1).toHaveBeenCalledWith('hello');
    expect(l2).toHaveBeenCalledWith('hello');
  });

  it('onMessage unsubscribe prevents future calls', () => {
    const t = new WebSocketTransport();
    const listener = vi.fn();
    const unsub = t.onMessage(listener);
    unsub();
    t.open('ws://localhost', 'tok');
    wsInstances[0]!.simulateMessage('hello');
    expect(listener).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// State change callbacks
// ---------------------------------------------------------------------------
describe('WebSocketTransport — state change callbacks', () => {
  it('onStateChange callback receives state transitions', () => {
    const t = new WebSocketTransport();
    const states: string[] = [];
    t.onStateChange((s) => states.push(s));
    t.open('ws://localhost', 'tok');
    wsInstances[0]!.simulateOpen();
    wsInstances[0]!.simulateClose();
    expect(states).toEqual(['connecting', 'connected', 'disconnected']);
  });

  it('onStateChange unsubscribe prevents future calls', () => {
    const t = new WebSocketTransport();
    const listener = vi.fn();
    const unsub = t.onStateChange(listener);
    unsub();
    t.open('ws://localhost', 'tok');
    expect(listener).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// send()
// ---------------------------------------------------------------------------
describe('WebSocketTransport — send', () => {
  it('sends data when readyState is OPEN', () => {
    const t = new WebSocketTransport();
    t.open('ws://localhost', 'tok');
    const ws = wsInstances[0]!;
    ws.simulateOpen();
    t.send('{"type":"ping"}');
    expect(ws.send).toHaveBeenCalledWith('{"type":"ping"}');
  });

  it('does not send when connection is not open', () => {
    const t = new WebSocketTransport();
    t.open('ws://localhost', 'tok');
    const ws = wsInstances[0]!;
    // readyState is 0 (CONNECTING), not 1 (OPEN)
    t.send('data');
    expect(ws.send).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Stale handler protection — second open() call replaces the ws
// ---------------------------------------------------------------------------
describe('WebSocketTransport — stale handler protection', () => {
  it('events from a replaced WebSocket are ignored', () => {
    const t = new WebSocketTransport();
    const states: string[] = [];
    t.onStateChange((s) => states.push(s));

    t.open('ws://localhost', 'tok');
    const firstWs = wsInstances[0]!;
    // Open a second connection before the first completes
    t.open('ws://localhost', 'tok2');
    const secondWs = wsInstances[1]!;

    // First ws fires connected — should be ignored because this.ws !== firstWs
    firstWs.simulateOpen();
    // Only second ws connecting state should be recorded
    secondWs.simulateOpen();

    // The stale 'connected' from firstWs should not appear
    expect(states.filter((s) => s === 'connected')).toHaveLength(1);
  });

  it('close followed by event on the closed ws is ignored', () => {
    const t = new WebSocketTransport();
    const states: string[] = [];
    t.onStateChange((s) => states.push(s));

    t.open('ws://localhost', 'tok');
    const ws = wsInstances[0]!;
    ws.simulateOpen();
    t.close(); // sets this.ws to null
    states.length = 0; // reset after close transition

    // Stale onerror fires after intentional close
    ws.simulateError();
    expect(states).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// transport name
// ---------------------------------------------------------------------------
describe('WebSocketTransport — name', () => {
  it('reports name as "websocket"', () => {
    expect(new WebSocketTransport().name).toBe('websocket');
  });
});
