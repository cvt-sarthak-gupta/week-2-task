/// <reference lib="webworker" />
import type { WorkerRequest, WorkerResponse } from './protocol';
import type { Patient } from '@/shared/types';
import { evaluate } from '@/features/filters/ast/evaluator';
import type { FilterNode } from '@/features/filters/ast/types';

let dataset: readonly Patient[] = [];

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;

  switch (req.type) {
    case 'set_dataset':
      dataset = req.patients;
      break;

    case 'update_patients': {
      const updateMap = new Map(req.updates.map((p) => [p.id, p]));
      const existingIds = new Set(dataset.map((p) => p.id));
      const merged = dataset.map((p) => updateMap.get(p.id) ?? p);
      const newPatients = req.updates.filter((p) => !existingIds.has(p.id));
      dataset = newPatients.length > 0 ? [...merged, ...newPatients] : merged;
      break;
    }

    case 'filter': {
      const node = req.ast as FilterNode;
      const ids = dataset.filter((p) => evaluate(node, p)).map((p) => p.id);
      const msg: WorkerResponse = { type: 'filter_result', ids, requestId: req.requestId };
      self.postMessage(msg);
      break;
    }

    default:
      break;
  }
};
