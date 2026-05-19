import type { ITransport, TransportState } from './ITransport';

type MessageCb = (raw: string) => void;
type StateCb = (state: TransportState) => void;

export class SseTransport implements ITransport {
  readonly name = 'sse' as const;
  private es: EventSource | null = null;
  private _state: TransportState = 'disconnected';
  private readonly messageCbs = new Set<MessageCb>();
  private readonly stateCbs = new Set<StateCb>();

  get state(): TransportState {
    return this._state;
  }

  open(url: string, token: string): void {
    if (this.es) this.close();
    this.setState('connecting');

    // Convert ws(s):// → http(s):// and replace /ws path suffix with /sse
    const httpBase = url.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/ws$/, '');
    const sseUrl = `${httpBase}/sse?token=${encodeURIComponent(token)}`;
    this.es = new EventSource(sseUrl);

    this.es.onopen = () => this.setState('connected');
    this.es.onerror = () => {
      // EventSource auto-reconnects; we just reflect the state
      this.setState(this.es?.readyState === EventSource.CLOSED ? 'disconnected' : 'connecting');
    };
    this.es.onmessage = (e) => {
      if (typeof e.data === 'string') this.messageCbs.forEach((cb) => cb(e.data as string));
    };
  }

  close(): void {
    this.es?.close();
    this.es = null;
    this.setState('disconnected');
  }

  /** SSE is one-way; send is a no-op (heartbeat pings go over REST). */
  send(_data: string): void {
    // intentional no-op
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
