import type { WorkerRequest, WorkerResponse, PatientUpdate } from './protocol';
import type { DataEvent } from '../realtime/events.types';
import { StreamWorkerLogic } from './StreamWorkerLogic';
import { eventBus } from '../realtime/eventBus';

type BatchCb = (updates: readonly PatientUpdate[]) => void;

/**
 * Wraps stream.worker.ts. Sends raw DataEvents to the worker for off-main-thread
 * dedup, out-of-order reconciliation, and batching. Falls back to main-thread
 * processing if Workers are unavailable.
 */
export class StreamWorkerClient {
  private worker: Worker | null = null;
  private fallbackLogic: StreamWorkerLogic | null = null;
  private fallbackFlushId: ReturnType<typeof setTimeout> | null = null;
  private readonly batchCbs = new Set<BatchCb>();

  init(): void {
    if (this.worker || this.fallbackLogic) return;
    try {
      this.worker = new Worker(
        new URL('./stream.worker.ts', import.meta.url),
        { type: 'module' },
      );
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        this.handleWorkerMessage(e.data);
      };
      this.worker.onerror = (err) => {
        console.error('[StreamWorker] error — falling back to main thread:', err);
        this.worker?.terminate();
        this.worker = null;
        this.activateFallback();
      };
      const initMsg: WorkerRequest = { type: 'init', tenantId: '' };
      this.worker.postMessage(initMsg);
    } catch {
      this.activateFallback();
    }
  }

  sendEvent(event: DataEvent): void {
    if (this.worker) {
      const msg: WorkerRequest = { type: 'raw_event', payload: event };
      this.worker.postMessage(msg);
      return;
    }
    // Fallback: process on main thread, then flush as a batch
    if (this.fallbackLogic) {
      this.fallbackLogic.processEvent(event);
      this.scheduleFallbackFlush();
    } else {
      // Nothing initialized yet — publish directly to bus so events aren't lost
      eventBus.publish(event);
    }
  }

  initDataset(patients: readonly { id: string; version: number }[]): void {
    if (this.worker) {
      const msg: WorkerRequest = { type: 'set_dataset', patients: patients as never };
      this.worker.postMessage(msg);
    } else {
      this.fallbackLogic?.initVersions(patients);
    }
  }

  /** Subscribe to processed batch updates. Returns an unsubscribe function. */
  onBatch(cb: BatchCb): () => void {
    this.batchCbs.add(cb);
    return () => this.batchCbs.delete(cb);
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.fallbackLogic?.reset();
    this.fallbackLogic = null;
    if (this.fallbackFlushId !== null) {
      clearTimeout(this.fallbackFlushId);
      this.fallbackFlushId = null;
    }
  }

  private activateFallback(): void {
    this.fallbackLogic = new StreamWorkerLogic();
  }

  private scheduleFallbackFlush(): void {
    if (this.fallbackFlushId !== null) return;
    this.fallbackFlushId = setTimeout(() => {
      this.fallbackFlushId = null;
      if (!this.fallbackLogic?.hasPending()) return;
      const updates = this.fallbackLogic.flushBatch();
      this.batchCbs.forEach((cb) => cb(updates));
    }, 0);
  }

  private handleWorkerMessage(msg: WorkerResponse): void {
    switch (msg.type) {
      case 'batch_update':
        this.batchCbs.forEach((cb) => cb(msg.updates));
        break;
      case 'passthrough_event':
        // Non-patient events (vitals, alerts) come back through the event bus
        eventBus.publish(msg.event);
        break;
      case 'ready':
        break;
      default:
        break;
    }
  }
}

export const streamWorkerClient = new StreamWorkerClient();
