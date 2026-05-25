import { useEffect, useRef, useCallback } from 'react';
import type { WorkerRequest, WorkerResponse } from './protocol';
import type { Patient } from '@/shared/types';
import type { PatientFilters } from '@/features/patients/patientFilters';
import { Filter } from '@/features/filters/ast/types';
import type { FilterNode } from '@/features/filters/ast/types';
import { deserializeUrl } from '@/features/filters/ast/url-format';

export function buildFilterAst(filters: PatientFilters): FilterNode | null {
  if (filters.filter) {
    try {
      return deserializeUrl(filters.filter);
    } catch {
    }
  }

  const conditions: FilterNode[] = [];

  if (filters.status) {
    conditions.push(Filter.eq('status', filters.status));
  }
  if (filters.ward) {
    conditions.push(Filter.eq('ward', filters.ward));
  }
  if (filters.search) {
    conditions.push(
      Filter.or(
        Filter.contains('firstName', filters.search),
        Filter.contains('lastName', filters.search),
        Filter.contains('mrn', filters.search),
      ),
    );
  }

  if (conditions.length === 0) return null;
  if (conditions.length === 1) return conditions[0]!;
  return Filter.and(...conditions);
}

type FilterResultCb = (ids: ReadonlySet<string> | null) => void;

export function useFilterWorker(
  patients: readonly Patient[],
  filters: PatientFilters,
  onResult: FilterResultCb,
): void {
  const workerRef = useRef<Worker | null>(null);
  const reqIdRef = useRef(0);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('./filter.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        if (msg.type === 'filter_result') {
          onResultRef.current(new Set(msg.ids));
        }
      };
      worker.onerror = (err) => { console.error('[FilterWorker] error:', err); };
      workerRef.current = worker;
    } catch {
      workerRef.current = null;
    }
    return () => { worker?.terminate(); workerRef.current = null; };
  }, []);

  const sentVersionsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;
    const sentVersions = sentVersionsRef.current;

    if (sentVersions.size === 0 || patients.length < sentVersions.size) {
      sentVersions.clear();
      const msg: WorkerRequest = { type: 'set_dataset', patients };
      worker.postMessage(msg);
      for (const p of patients) sentVersions.set(p.id, p.version);
    } else {
      const changed = patients.filter((p) => (sentVersions.get(p.id) ?? -1) < p.version);
      if (changed.length > 0) {
        const msg: WorkerRequest = { type: 'update_patients', updates: changed };
        worker.postMessage(msg);
        for (const p of changed) sentVersions.set(p.id, p.version);
      }
    }
  }, [patients]);

  const runFilter = useCallback(() => {
    const worker = workerRef.current;
    const ast = buildFilterAst(filters);

    if (!ast) {
      onResultRef.current(null);
      return;
    }

    if (!worker) {
      import('@/features/filters/ast/evaluator').then(({ evaluate }) => {
        const ids = new Set(patients.filter((p) => evaluate(ast, p)).map((p) => p.id));
        onResultRef.current(ids);
      }).catch(() => { onResultRef.current(null); });
      return;
    }

    const requestId = String(++reqIdRef.current);
    const msg: WorkerRequest = { type: 'filter', ast, requestId };
    worker.postMessage(msg);
  }, [filters, patients]);

  useEffect(() => { runFilter(); }, [runFilter]);
}
