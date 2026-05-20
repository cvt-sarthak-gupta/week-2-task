import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SseTransport } from './SseTransport';

// ---------------------------------------------------------------------------
// Minimal mock EventSource
// ---------------------------------------------------------------------------
interface MockEsInstance {
  url: string;
  readyState: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  close: ReturnType<typeof vi.fn<any[], any>>;
  onopen: ((e: Event) => void) | null;
  onerror: ((e: Event) => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  simulateOpen(): void;
  simulateMessage(data: string): void;
  simulateError(readyState?: number): void;
}

const esInstances: MockEsInstance[] = [];

class MockEventSource implements MockEsInstance {
  static CLOSED = 2;
  url: string;
  readyState = 0;
  onopen: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  close = vi.fn(() => { this.readyState = 2; }) as ReturnType<typeof vi.fn<any[], any>>;

  constructor(url: string) {
    this.url = url;
    esInstances.push(this);
  }

  simulateOpen() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: string) {
    this.onmessage?.({ data });
  }

  simulateError(readyState = 0) {
    this.readyState = readyState;
    this.onerror?.(new Event('error'));
  }
}

beforeEach(() => {
  esInstances.length = 0;
  vi.stubGlobal('EventSource', MockEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------
describe('SseTransport — state transitions', () => {
  it('starts disconnected', () => {
    const t = new SseTransport();
    expect(t.state).toBe('disconnected');
  });

  it('open() moves to connecting', () => {
    const t = new SseTransport();
    t.open('ws://localhost/ws', 'tok');
    expect(t.state).toBe('connecting');
  });

  it('onopen fires → state becomes connected', () => {
    const t = new SseTransport();
    t.open('ws://localhost/ws', 'tok');
    esInstances[0]!.simulateOpen();
    expect(t.state).toBe('connected');
  });

  it('onerror with CLOSED readyState → disconnected', () => {
    const t = new SseTransport();
    t.open('ws://localhost/ws', 'tok');
    esInstances[0]!.simulateOpen();
    // Simulate CLOSED (readyState 2 = EventSource.CLOSED)
    esInstances[0]!.simulateError(2);
    expect(t.state).toBe('disconnected');
  });

  it('onerror with non-CLOSED readyState → connecting (auto-reconnect)', () => {
    const t = new SseTransport();
    t.open('ws://localhost/ws', 'tok');
    esInstances[0]!.simulateOpen();
    esInstances[0]!.simulateError(0); // CONNECTING
    expect(t.state).toBe('connecting');
  });

  it('close() moves to disconnected and calls es.close()', () => {
    const t = new SseTransport();
    t.open('ws://localhost/ws', 'tok');
    esInstances[0]!.simulateOpen();
    t.close();
    expect(t.state).toBe('disconnected');
    expect(esInstances[0]!.close).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// URL transformation — ws(s):// → http(s)://, /ws suffix → /sse
// ---------------------------------------------------------------------------
describe('SseTransport — URL transformation', () => {
  it('converts ws:// to http://', () => {
    const t = new SseTransport();
    t.open('ws://host/ws', 'tok');
    expect(esInstances[0]!.url).toBe('http://host/sse?token=tok');
  });

  it('converts wss:// to https://', () => {
    const t = new SseTransport();
    t.open('wss://host/ws', 'tok');
    expect(esInstances[0]!.url).toBe('https://host/sse?token=tok');
  });

  it('appends token as query param', () => {
    const t = new SseTransport();
    t.open('ws://api.example.com/ws', 'my-token');
    expect(esInstances[0]!.url).toContain('token=my-token');
  });

  it('percent-encodes token special characters', () => {
    const t = new SseTransport();
    t.open('ws://host/ws', 'tok=en/val');
    expect(esInstances[0]!.url).toContain('token=tok%3Den%2Fval');
  });
});

// ---------------------------------------------------------------------------
// Message callbacks
// ---------------------------------------------------------------------------
describe('SseTransport — message callbacks', () => {
  it('onMessage callback receives server data', () => {
    const t = new SseTransport();
    const received: string[] = [];
    t.onMessage((raw) => received.push(raw));
    t.open('ws://localhost/ws', 'tok');
    esInstances[0]!.simulateMessage('{"type":"status_changed"}');
    expect(received).toEqual(['{"type":"status_changed"}']);
  });

  it('multiple onMessage subscribers all receive messages', () => {
    const t = new SseTransport();
    const l1 = vi.fn();
    const l2 = vi.fn();
    t.onMessage(l1);
    t.onMessage(l2);
    t.open('ws://localhost/ws', 'tok');
    esInstances[0]!.simulateMessage('hello');
    expect(l1).toHaveBeenCalledWith('hello');
    expect(l2).toHaveBeenCalledWith('hello');
  });

  it('onMessage unsubscribe prevents future calls', () => {
    const t = new SseTransport();
    const listener = vi.fn();
    const unsub = t.onMessage(listener);
    unsub();
    t.open('ws://localhost/ws', 'tok');
    esInstances[0]!.simulateMessage('hello');
    expect(listener).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// State change callbacks
// ---------------------------------------------------------------------------
describe('SseTransport — state change callbacks', () => {
  it('onStateChange reports transitions in order', () => {
    const t = new SseTransport();
    const states: string[] = [];
    t.onStateChange((s) => states.push(s));
    t.open('ws://localhost/ws', 'tok');
    esInstances[0]!.simulateOpen();
    expect(states).toEqual(['connecting', 'connected']);
  });

  it('onStateChange unsubscribe prevents future calls', () => {
    const t = new SseTransport();
    const listener = vi.fn();
    const unsub = t.onStateChange(listener);
    unsub();
    t.open('ws://localhost/ws', 'tok');
    expect(listener).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// send() is a no-op
// ---------------------------------------------------------------------------
describe('SseTransport — send is a no-op', () => {
  it('send does not throw and does not affect the EventSource', () => {
    const t = new SseTransport();
    t.open('ws://localhost/ws', 'tok');
    esInstances[0]!.simulateOpen();
    expect(() => t.send('{"type":"ping"}')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Replacing an active connection
// ---------------------------------------------------------------------------
describe('SseTransport — open() replaces existing connection', () => {
  it('calling open() a second time closes the first EventSource', () => {
    const t = new SseTransport();
    t.open('ws://localhost/ws', 'tok');
    const firstEs = esInstances[0]!;
    t.open('ws://localhost/ws', 'tok2');
    expect(firstEs.close).toHaveBeenCalled();
    expect(esInstances).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// transport name
// ---------------------------------------------------------------------------
describe('SseTransport — name', () => {
  it('reports name as "sse"', () => {
    expect(new SseTransport().name).toBe('sse');
  });
});
