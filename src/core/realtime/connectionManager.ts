import { WebSocketTransport } from './transport/WebSocketTransport';
import { SseTransport } from './transport/SseTransport';
import type { ITransport, TransportState } from './transport/ITransport';
import { ReconnectScheduler } from './reconnect';
import { streamWorkerClient } from '@/core/workers/StreamWorkerClient';
import type { DataEvent, HeartbeatEvent, ServerEvent } from './events.types';
import { getAccessToken } from '@/core/api/tokens';

const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 5_000;

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'sse_fallback';

type StatusListener = (status: ConnectionStatus) => void;

export class ConnectionManager {
  private transport: ITransport;
  private usingSse = false;
  private readonly reconnect = new ReconnectScheduler();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
  private _status: ConnectionStatus = 'idle';
  private readonly statusListeners = new Set<StatusListener>();
  private url = '';
  private token = '';
  private cleanups: Array<() => void> = [];

  constructor(initialTransport?: ITransport, usingSse = false) {
    this.transport = initialTransport ?? new WebSocketTransport();
    this.usingSse = usingSse;
    this.bindTransport();
  }

  connect(url: string, token: string): void {
    this.url = url;
    this.token = token;
    // Re-bind listeners if they were cleared by a prior disconnect()
    if (this.cleanups.length === 0) {
      this.bindTransport();
    }
    this.transport.open(url, token);
    this.setStatus('connecting');
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.reconnect.reset();
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    this.transport.close();
    // Reset to WebSocket so the next connect() re-attempts WS instead of going straight to SSE
    if (this.usingSse) {
      this.transport = new WebSocketTransport();
      this.usingSse = false;
    }
    this.setStatus('idle');
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  get transportName(): 'websocket' | 'sse' {
    return this.transport.name;
  }

  onStatusChange(cb: StatusListener): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  private bindTransport(): void {
    const unsubMsg = this.transport.onMessage((raw) => this.handleRaw(raw));
    const unsubState = this.transport.onStateChange((s) => this.handleTransportState(s));
    this.cleanups.push(unsubMsg, unsubState);
  }

  private handleTransportState(state: TransportState): void {
    if (state === 'connected') {
      this.reconnect.reset();
      this.setStatus(this.usingSse ? 'sse_fallback' : 'connected');
      this.startHeartbeat();
      return;
    }
    if (state === 'failed' && !this.usingSse) {
      // WS failed → switch to SSE
      this.switchToSse();
      return;
    }
    if (state === 'disconnected' || state === 'failed') {
      this.stopHeartbeat();
      this.setStatus('reconnecting');
      this.reconnect.schedule(() => {
        // Always use the latest token so a mid-session refresh doesn't break reconnects
        const fresh = getAccessToken();
        if (fresh) this.token = fresh;
        if (this.usingSse) {
          // Re-attempt WebSocket on reconnect; if WS fails again, handleTransportState
          // will see state==='failed' && !usingSse and call switchToSse() automatically.
          this.cleanups.forEach((fn) => fn());
          this.cleanups = [];
          this.transport.close();
          this.transport = new WebSocketTransport();
          this.usingSse = false;
          this.bindTransport();
        }
        this.transport.open(this.url, this.token);
      });
    }
  }

  private switchToSse(): void {
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    this.transport.close();
    this.transport = new SseTransport();
    this.usingSse = true;
    this.bindTransport();
    this.transport.open(this.url, this.token);
    this.setStatus('sse_fallback');
  }

  private handleRaw(raw: string): void {
    let event: ServerEvent;
    try {
      event = JSON.parse(raw) as ServerEvent;
    } catch {
      return; // malformed — discard
    }

    if (event.type === 'pong') {
      this.clearHeartbeatTimeout();
      return;
    }

    // Forward to the stream worker for off-main-thread dedup, ordering, and batching.
    // StreamWorkerClient falls back to main-thread processing if Workers are unavailable.
    streamWorkerClient.sendEvent(event as DataEvent);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    // SSE auto-reconnects via EventSource; ping/pong is a no-op on that transport.
    // Sending a ping with no pong response would trigger a false "connection dropped"
    // detection every 20s — skip heartbeat entirely when on SSE.
    if (this.usingSse) return;
    this.heartbeatInterval = setInterval(() => {
      this.transport.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
      this.heartbeatTimeout = setTimeout(() => {
        // No pong received — treat as dropped
        this.transport.close();
        this.setStatus('reconnecting');
        this.reconnect.schedule(() => {
          const fresh = getAccessToken();
          if (fresh) this.token = fresh;
          this.transport.open(this.url, this.token);
        });
      }, HEARTBEAT_TIMEOUT_MS);
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.clearHeartbeatTimeout();
  }

  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeout !== null) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  private setStatus(s: ConnectionStatus): void {
    this._status = s;
    this.statusListeners.forEach((cb) => cb(s));
  }
}

export const connectionManager = new ConnectionManager();
