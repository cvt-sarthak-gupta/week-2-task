import { describe, it, expect, vi, beforeEach } from 'vitest';
import { streamBootstrap, StreamBootstrapError } from './streamBootstrap';
import type { Patient } from '@/shared/types';
import { makeMockPatient } from '@/core/testing/factories';

// ---------------------------------------------------------------------------
// Helper: build a Response whose body is a ReadableStream of NDJSON
// ---------------------------------------------------------------------------

function ndjsonResponse(patients: Patient[], status = 200): Response {
  const ndjson = patients.map((p) => JSON.stringify(p)).join('\n') + (patients.length > 0 ? '\n' : '');
  const encoder = new TextEncoder();
  const encoded = encoder.encode(ndjson);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (encoded.length > 0) {
        controller.enqueue(encoded);
      }
      controller.close();
    },
  });

  return new Response(stream, { status, headers: { 'Content-Type': 'application/x-ndjson' } });
}

// ---------------------------------------------------------------------------
// Helper: build a Response that enqueues chunkSize records per pull
// ---------------------------------------------------------------------------

function chunkedResponse(patients: Patient[], chunkSize: number): Response {
  const encoder = new TextEncoder();
  let offset = 0;

  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const slice = patients.slice(offset, offset + chunkSize);
      offset += chunkSize;
      if (slice.length === 0) {
        controller.close();
        return;
      }
      const chunk = slice.map((p) => JSON.stringify(p)).join('\n') + '\n';
      controller.enqueue(encoder.encode(chunk));
    },
  });

  return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('streamBootstrap', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('receives all records and returns total count', async () => {
    const patients = Array.from({ length: 5 }, (_, i) => makeMockPatient({ id: `p-${i + 1}` }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse(patients)));

    const receivedIds: string[] = [];
    const count = await streamBootstrap({
      url: '/api/patients/stream',
      onBatch: (batch) => { receivedIds.push(...batch.map((p) => p.id)); },
      onCheckpoint: vi.fn(),
    });

    expect(count).toBe(5);
    expect(receivedIds).toHaveLength(5);
    expect(receivedIds).toEqual(expect.arrayContaining(patients.map((p) => p.id)));
  });

  it('calls onBatch multiple times when records exceed batchSize', async () => {
    const patients = Array.from({ length: 10 }, (_, i) => makeMockPatient({ id: `p-${i + 1}` }));
    // Use chunkedResponse so records arrive incrementally, triggering mid-stream flushes
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(chunkedResponse(patients, 1)));

    const batchSizes: number[] = [];
    const count = await streamBootstrap({
      url: '/api/patients/stream',
      batchSize: 3,
      onBatch: (batch) => { batchSizes.push(batch.length); },
      onCheckpoint: vi.fn(),
    });

    expect(count).toBe(10);
    const total = batchSizes.reduce((sum, n) => sum + n, 0);
    expect(total).toBe(10);
    expect(batchSizes.length).toBeGreaterThan(1);
  });

  it('calls onCheckpoint after each batch with max updatedAt in that batch', async () => {
    const ts1 = new Date('2024-01-01T00:00:00Z').getTime();
    const ts2 = new Date('2024-03-01T00:00:00Z').getTime();
    const ts3 = new Date('2024-02-01T00:00:00Z').getTime();

    const patients = [
      makeMockPatient({ id: 'p-1', updatedAt: new Date(ts1).toISOString() }),
      makeMockPatient({ id: 'p-2', updatedAt: new Date(ts2).toISOString() }),
      makeMockPatient({ id: 'p-3', updatedAt: new Date(ts3).toISOString() }),
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse(patients)));

    const checkpoints: number[] = [];
    await streamBootstrap({
      url: '/api/patients/stream',
      batchSize: 100,
      onBatch: vi.fn(),
      onCheckpoint: (ts) => { checkpoints.push(ts); },
    });

    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]).toBe(ts2); // max of the three timestamps
  });

  it('includes the url exactly as passed to fetch', async () => {
    const mockFetch = vi.fn().mockResolvedValue(ndjsonResponse([]));
    vi.stubGlobal('fetch', mockFetch);

    await streamBootstrap({
      url: '/api/patients/stream?since=12345',
      onBatch: vi.fn(),
      onCheckpoint: vi.fn(),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/patients/stream?since=12345',
      expect.anything(),
    );
  });

  it('throws StreamBootstrapError on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse([], 503)));

    await expect(
      streamBootstrap({
        url: '/api/patients/stream',
        onBatch: vi.fn(),
        onCheckpoint: vi.fn(),
      }),
    ).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof StreamBootstrapError &&
        err.message.includes('503')
      );
    });
  });

  it('throws StreamBootstrapError when response body is null', async () => {
    const nullBodyResponse = new Response(null, { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(nullBodyResponse));

    await expect(
      streamBootstrap({
        url: '/api/patients/stream',
        onBatch: vi.fn(),
        onCheckpoint: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(StreamBootstrapError);
  });

  it('skips malformed JSON lines without throwing', async () => {
    const goodPatient = makeMockPatient({ id: 'p-good' });
    const encoder = new TextEncoder();
    const rawNdjson = `{bad json here}\n${JSON.stringify(goodPatient)}\nnot-json-at-all\n`;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(rawNdjson));
        controller.close();
      },
    });
    const response = new Response(stream, { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const received: Patient[] = [];
    const count = await streamBootstrap({
      url: '/api/patients/stream',
      onBatch: (batch) => { received.push(...batch); },
      onCheckpoint: vi.fn(),
    });

    expect(count).toBe(1);
    expect(received).toHaveLength(1);
    expect(received[0]!.id).toBe('p-good');
  });

  it('handles empty stream (no records)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse([])));

    const onBatch = vi.fn();
    const onCheckpoint = vi.fn();
    const count = await streamBootstrap({
      url: '/api/patients/stream',
      onBatch,
      onCheckpoint,
    });

    expect(count).toBe(0);
    expect(onBatch).not.toHaveBeenCalled();
    expect(onCheckpoint).not.toHaveBeenCalled();
  });

  it('propagates AbortError when signal fires before stream', async () => {
    const ac = new AbortController();
    ac.abort();

    const abortError = new DOMException('The user aborted a request.', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    await expect(
      streamBootstrap({
        url: '/api/patients/stream',
        signal: ac.signal,
        onBatch: vi.fn(),
        onCheckpoint: vi.fn(),
      }),
    ).rejects.toThrow(DOMException);
  });

  it('passes AbortSignal to fetch', async () => {
    const ac = new AbortController();
    const mockFetch = vi.fn().mockResolvedValue(ndjsonResponse([]));
    vi.stubGlobal('fetch', mockFetch);

    await streamBootstrap({
      url: '/api/patients/stream',
      signal: ac.signal,
      onBatch: vi.fn(),
      onCheckpoint: vi.fn(),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: ac.signal }),
    );
  });

  it('assembles records split across TCP chunks correctly', async () => {
    const patient = makeMockPatient({ id: 'p-split' });
    const encoder = new TextEncoder();
    const fullLine = JSON.stringify(patient) + '\n';
    // Split the JSON in the middle of the string to simulate a TCP chunk boundary
    const mid = Math.floor(fullLine.length / 2);
    const chunk1 = encoder.encode(fullLine.slice(0, mid));
    const chunk2 = encoder.encode(fullLine.slice(mid));

    let pullCount = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pullCount === 0) {
          controller.enqueue(chunk1);
        } else if (pullCount === 1) {
          controller.enqueue(chunk2);
        } else {
          controller.close();
        }
        pullCount += 1;
      },
    });

    const response = new Response(stream, { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const received: Patient[] = [];
    const count = await streamBootstrap({
      url: '/api/patients/stream',
      onBatch: (batch) => { received.push(...batch); },
      onCheckpoint: vi.fn(),
    });

    expect(count).toBe(1);
    expect(received).toHaveLength(1);
    expect(received[0]!.id).toBe('p-split');
  });
});
