import type { Patient } from '@/shared/types';

export interface BatchMeta {
  received: number;
  batchIndex: number;
}

export interface StreamBootstrapOptions {
  url: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  batchSize?: number;
  onBatch: (patients: Patient[], meta: BatchMeta) => void;
  onCheckpoint: (lastUpdatedAt: number) => void;
}

export class StreamBootstrapError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'StreamBootstrapError';
  }
}

export async function streamBootstrap(options: StreamBootstrapOptions): Promise<number> {
  const {
    url,
    headers,
    signal,
    batchSize = 100,
    onBatch,
    onCheckpoint,
  } = options;

  const fetchInit: RequestInit = {};
  if (headers !== undefined) fetchInit.headers = headers;
  if (signal !== undefined) fetchInit.signal = signal;
  const response = await fetch(url, fetchInit);

  if (!response.ok) {
    throw new StreamBootstrapError(
      `HTTP error ${response.status}: ${response.statusText}`,
      response.status,
    );
  }

  if (response.body === null) {
    throw new StreamBootstrapError('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });

  let buffer = '';
  let pendingBatch: Patient[] = [];
  let totalReceived = 0;
  let batchIndex = 0;

  const flushBatch = () => {
    if (pendingBatch.length === 0) return;

    const maxUpdatedAt = pendingBatch.reduce((max, p) => {
      const ts = new Date(p.updatedAt).getTime();
      return ts > max ? ts : max;
    }, -Infinity);

    onBatch(pendingBatch, { received: totalReceived, batchIndex });
    onCheckpoint(maxUpdatedAt);

    batchIndex += 1;
    pendingBatch = [];
  };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        const remaining = decoder.decode(undefined, { stream: false });
        buffer += remaining;

        const lines = buffer.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.length === 0) continue;
          try {
            const patient = JSON.parse(trimmed) as Patient;
            pendingBatch.push(patient);
            totalReceived += 1;
          } catch {
            console.warn('[streamBootstrap] Skipping malformed JSON line:', trimmed);
          }
        }

        flushBatch();
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        try {
          const patient = JSON.parse(trimmed) as Patient;
          pendingBatch.push(patient);
          totalReceived += 1;
        } catch {
          console.warn('[streamBootstrap] Skipping malformed JSON line:', trimmed);
        }

        if (pendingBatch.length >= batchSize) {
          flushBatch();
          await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return totalReceived;
}
