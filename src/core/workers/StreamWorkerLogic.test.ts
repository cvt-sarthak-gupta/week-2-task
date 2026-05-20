import { describe, it, expect, beforeEach } from 'vitest';
import { StreamWorkerLogic } from './StreamWorkerLogic';
import type { DataEvent } from '../realtime/events.types';

function makeStatusEvent(overrides: Partial<{
  id: string; entityId: string; version: number; ts: number;
  previousStatus: string; newStatus: string;
}> = {}): DataEvent {
  return {
    type: 'status_changed',
    id: overrides.id ?? 'evt-1',
    entityId: overrides.entityId ?? 'p-1',
    version: overrides.version ?? 1,
    ts: overrides.ts ?? Date.now(),
    payload: {
      previousStatus: (overrides.previousStatus ?? 'stable') as 'stable',
      newStatus: (overrides.newStatus ?? 'critical') as 'critical',
    },
  };
}

function makePatientEvent(overrides: Partial<{
  id: string; entityId: string; version: number; notes: string;
}> = {}): DataEvent {
  return {
    type: 'patient_updated',
    id: overrides.id ?? 'evt-2',
    entityId: overrides.entityId ?? 'p-1',
    version: overrides.version ?? 1,
    ts: Date.now(),
    payload: { notes: overrides.notes ?? 'updated note' },
  };
}

describe('StreamWorkerLogic — deduplication', () => {
  let logic: StreamWorkerLogic;

  beforeEach(() => { logic = new StreamWorkerLogic(); });

  it('accepts a new event id', () => {
    expect(logic.addToDedup('evt-1')).toBe(true);
  });

  it('rejects a duplicate event id', () => {
    logic.addToDedup('evt-1');
    expect(logic.addToDedup('evt-1')).toBe(false);
  });

  it('evicts oldest entry when cache exceeds 2000', () => {
    for (let i = 0; i < 2001; i++) logic.addToDedup(`evt-${i}`);
    // After 2001 inserts: cache holds evt-1..evt-2000 (evt-0 was evicted)
    // A middle entry is still present → rejected
    expect(logic.addToDedup('evt-500')).toBe(false);
    // evt-0 was evicted → accepted again
    expect(logic.addToDedup('evt-0')).toBe(true);
  });

  it('reset clears dedup cache', () => {
    logic.addToDedup('evt-1');
    logic.reset();
    expect(logic.addToDedup('evt-1')).toBe(true);
  });
});

describe('StreamWorkerLogic — out-of-order rejection', () => {
  let logic: StreamWorkerLogic;

  beforeEach(() => { logic = new StreamWorkerLogic(); });

  it('accepts a newer version for the same entity', () => {
    logic.processEvent(makeStatusEvent({ id: 'e1', version: 1 }));
    logic.processEvent(makeStatusEvent({ id: 'e2', version: 2 }));
    expect(logic.flushBatch()).toHaveLength(2);
  });

  it('rejects a stale version for the same entity', () => {
    logic.processEvent(makeStatusEvent({ id: 'e1', version: 5 }));
    logic.processEvent(makeStatusEvent({ id: 'e2', version: 4, entityId: 'p-1' }));
    const batch = logic.flushBatch();
    expect(batch).toHaveLength(1);
    expect(batch[0]!.version).toBe(5);
  });

  it('rejects an equal-version event (already applied)', () => {
    logic.processEvent(makeStatusEvent({ id: 'e1', version: 3 }));
    logic.processEvent(makeStatusEvent({ id: 'e2', version: 3, entityId: 'p-1' }));
    expect(logic.flushBatch()).toHaveLength(1);
  });

  it('initVersions seeds entity state so old events are dropped immediately', () => {
    logic.initVersions([{ id: 'p-1', version: 10 }]);
    logic.processEvent(makeStatusEvent({ id: 'e1', version: 9 }));
    expect(logic.flushBatch()).toHaveLength(0);

    logic.processEvent(makeStatusEvent({ id: 'e2', version: 11 }));
    expect(logic.flushBatch()).toHaveLength(1);
  });
});

describe('StreamWorkerLogic — batch building', () => {
  let logic: StreamWorkerLogic;

  beforeEach(() => { logic = new StreamWorkerLogic(); });

  it('status_changed produces a patch with newStatus', () => {
    logic.processEvent(makeStatusEvent({ id: 'e1', entityId: 'p-1', newStatus: 'critical' }));
    const update = logic.flushBatch()[0]!;
    expect(update.id).toBe('p-1');
    expect(update.patch.status).toBe('critical');
  });

  it('patient_updated merges payload into patch', () => {
    logic.processEvent(makePatientEvent({ id: 'e1', entityId: 'p-2', notes: 'hello' }));
    const update = logic.flushBatch()[0]!;
    expect(update.id).toBe('p-2');
    expect(update.patch.notes).toBe('hello');
  });

  it('vitals_updated produces a patch with all four vitals fields', () => {
    logic.processEvent({
      type: 'vitals_updated',
      id: 'e1', entityId: 'p-1', version: 1, ts: Date.now(),
      payload: { heartRate: 90, bp: '120/80', temp: 37, o2sat: 98 },
    });
    const update = logic.flushBatch()[0]!;
    expect(update.id).toBe('p-1');
    expect(update.patch.heartRate).toBe(90);
    expect(update.patch.bp).toBe('120/80');
    expect(update.patch.temp).toBe(37);
    expect(update.patch.o2sat).toBe(98);
  });

  it('multiple vitals_updated events for the same entity all produce patches (bypasses version gate)', () => {
    logic.processEvent({ type: 'vitals_updated', id: 'v1', entityId: 'p-1', version: 0, ts: Date.now(), payload: { heartRate: 72, bp: '120/80', temp: 36.6, o2sat: 98 } });
    logic.processEvent({ type: 'vitals_updated', id: 'v2', entityId: 'p-1', version: 0, ts: Date.now(), payload: { heartRate: 75, bp: '122/82', temp: 36.7, o2sat: 97 } });
    logic.processEvent({ type: 'vitals_updated', id: 'v3', entityId: 'p-1', version: 0, ts: Date.now(), payload: { heartRate: 78, bp: '118/78', temp: 36.5, o2sat: 99 } });
    expect(logic.flushBatch()).toHaveLength(3);
  });

  it('order_changed does NOT produce a patient patch', () => {
    logic.processEvent({
      type: 'order_changed',
      id: 'e1', entityId: 'p-1', version: 1, ts: Date.now(),
      payload: { orderId: 'o-1', description: 'blood test', status: 'pending' },
    });
    expect(logic.flushBatch()).toHaveLength(0);
  });

  it('flushBatch drains the buffer', () => {
    logic.processEvent(makeStatusEvent({ id: 'e1' }));
    expect(logic.hasPending()).toBe(true);
    logic.flushBatch();
    expect(logic.hasPending()).toBe(false);
    expect(logic.flushBatch()).toHaveLength(0);
  });

  it('handles multiple distinct entities in one batch', () => {
    logic.processEvent(makeStatusEvent({ id: 'e1', entityId: 'p-1', version: 1 }));
    logic.processEvent(makeStatusEvent({ id: 'e2', entityId: 'p-2', version: 1 }));
    logic.processEvent(makeStatusEvent({ id: 'e3', entityId: 'p-3', version: 1 }));
    expect(logic.flushBatch()).toHaveLength(3);
  });

  it('patch includes updatedAt and version from event', () => {
    const ts = 1_700_000_000_000;
    logic.processEvent(makeStatusEvent({ id: 'e1', version: 7, ts }));
    const update = logic.flushBatch()[0]!;
    expect(update.patch.updatedAt).toBe(new Date(ts).toISOString());
    expect(update.patch.version).toBe(7);
    expect(update.version).toBe(7);
  });

  it('unknown event type hits default branch and produces no patch', () => {
    logic.processEvent({ type: 'future_event_type', id: 'u1', entityId: 'p-1', version: 1, ts: Date.now() } as unknown as DataEvent);
    expect(logic.flushBatch()).toHaveLength(0);
  });
});
