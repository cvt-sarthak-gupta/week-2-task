export type TransportState = 'connecting' | 'connected' | 'disconnected' | 'failed';

export interface ITransport {
  open(url: string, token: string): void;
  close(): void;
  send(data: string): void;
  onMessage(cb: (raw: string) => void): () => void;
  onStateChange(cb: (state: TransportState) => void): () => void;
  readonly state: TransportState;
  readonly name: 'websocket' | 'sse';
}
