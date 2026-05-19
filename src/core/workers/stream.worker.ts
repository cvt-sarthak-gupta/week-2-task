/// <reference lib="webworker" />
import type { WorkerRequest, WorkerResponse } from './protocol';
import { StreamWorkerLogic } from './StreamWorkerLogic';
import type { DataEvent } from '../realtime/events.types';

const logic = new StreamWorkerLogic();
let rafScheduled = false;

function flushBatch(): void {
  rafScheduled = false;
  if (!logic.hasPending()) return;
  const updates = logic.flushBatch();
  const msg: WorkerResponse = { type: 'batch_update', updates, frameTs: Date.now() };
  self.postMessage(msg);
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;

  switch (req.type) {
    case 'init':
      logic.reset();
      self.postMessage({ type: 'ready' } satisfies WorkerResponse);
      break;

    case 'raw_event': {
      const event = req.payload as DataEvent;

      // Passthrough non-patient events so the main thread can handle them
      if (
        event.type === 'order_changed' ||
        event.type === 'alert_raised'
      ) {
        self.postMessage({ type: 'passthrough_event', event } satisfies WorkerResponse);
        break;
      }

      logic.processEvent(event);

      if (!rafScheduled && logic.hasPending()) {
        rafScheduled = true;
        // Workers don't have requestAnimationFrame — use setTimeout(0) to batch within the same tick
        setTimeout(flushBatch, 0);
      }
      break;
    }

    case 'set_dataset':
      logic.initVersions(req.patients);
      break;

    default:
      break;
  }
};
