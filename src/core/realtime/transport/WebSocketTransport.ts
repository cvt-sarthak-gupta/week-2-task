import type { ITransport, TransportState } from './ITransport';

type MessageCb = (raw: string) => void;
type StateCb = (state: TransportState) => void;

export class WebSocketTransport implements ITransport {
  readonly name = 'websocket' as const;
  private ws: WebSocket | null = null;
  private _state: TransportState = 'disconnected';
  private _intentionalClose = false;
  private readonly messageCbs = new Set<MessageCb>();
  private readonly stateCbs = new Set<StateCb>();

  get state(): TransportState {
    return this._state;
  }

  open(url: string, token: string): void {
    if (this.ws) this.close();
    this._intentionalClose = false;
    this.setState('connecting');
    const ws = new WebSocket(`${url}?token=${encodeURIComponent(token)}`);
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.setState('connected');
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.setState(e.code === 1008 ? 'failed' : 'disconnected');
    };
    ws.onerror = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.setState('disconnected');
    };
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') this.messageCbs.forEach((cb) => cb(e.data as string));
    };
  }

  close(): void {
    this._intentionalClose = true;
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, 'client_close');
    this.setState('disconnected');
  }

  send(data: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data);
  }

  onMessage(cb: MessageCb): () => void {
    this.messageCbs.add(cb);
    return () => this.messageCbs.delete(cb);
  }

  onStateChange(cb: StateCb): () => void {
    this.stateCbs.add(cb);
    return () => this.stateCbs.delete(cb);
  }

  private setState(s: TransportState): void {
    this._state = s;
    this.stateCbs.forEach((cb) => cb(s));
  }
}
