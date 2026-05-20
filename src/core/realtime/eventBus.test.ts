import { describe, it, expect, vi, afterEach } from 'vitest';
import { eventBus } from './eventBus';
import type { DataEvent } from './events.types';

function makeStatusEvent(overrides: Partial<{ id: string; entityId: string; version: number }> = {}): DataEvent {
  return {
    type: 'status_changed',
    id: overrides.id ?? 'evt-1',
    entityId: overrides.entityId ?? 'p-1',
    version: overrides.version ?? 1,
    ts: Date.now(),
    payload: { previousStatus: 'stable', newStatus: 'critical' },
  };
}

function makeVitalsEvent(id = 'v-1'): DataEvent {
  return {
    type: 'vitals_updated',
    id,
    entityId: 'p-1',
    version: 1,
    ts: Date.now(),
    payload: { heartRate: 90, bp: '120/80', temp: 37.0, o2sat: 98 },
  };
}

afterEach(() => {
  eventBus.clear();
});

describe('EventBus — subscribe & publish', () => {
  it('calls listener when matching event is published', () => {
    const listener = vi.fn();
    eventBus.subscribe('status_changed', listener);
    const event = makeStatusEvent();
    eventBus.publish(event);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(event);
  });

  it('listener receives the exact event object', () => {
    const received: DataEvent[] = [];
    eventBus.subscribe('status_changed', (e) => received.push(e));
    const event = makeStatusEvent({ id: 'special-id' });
    eventBus.publish(event);
    expect(received[0]).toBe(event);
  });

  it('multiple listeners for same type all receive the event', () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    const l3 = vi.fn();
    eventBus.subscribe('status_changed', l1);
    eventBus.subscribe('status_changed', l2);
    eventBus.subscribe('status_changed', l3);
    eventBus.publish(makeStatusEvent());
    expect(l1).toHaveBeenCalledOnce();
    expect(l2).toHaveBeenCalledOnce();
    expect(l3).toHaveBeenCalledOnce();
  });

  it('does not call listeners for different event types', () => {
    const statusListener = vi.fn();
    const vitalsListener = vi.fn();
    eventBus.subscribe('status_changed', statusListener);
    eventBus.subscribe('vitals_updated', vitalsListener);

    eventBus.publish(makeVitalsEvent());
    expect(statusListener).not.toHaveBeenCalled();
    expect(vitalsListener).toHaveBeenCalledOnce();
  });

  it('publishes different event types independently', () => {
    const statusListener = vi.fn();
    const vitalsListener = vi.fn();
    eventBus.subscribe('status_changed', statusListener);
    eventBus.subscribe('vitals_updated', vitalsListener);

    eventBus.publish(makeStatusEvent());
    eventBus.publish(makeVitalsEvent());
    expect(statusListener).toHaveBeenCalledOnce();
    expect(vitalsListener).toHaveBeenCalledOnce();
  });

  it('publish with no subscribers is a no-op and does not throw', () => {
    expect(() => eventBus.publish(makeStatusEvent())).not.toThrow();
  });
});

describe('EventBus — unsubscribe', () => {
  it('unsubscribing prevents listener from receiving future events', () => {
    const listener = vi.fn();
    const unsub = eventBus.subscribe('status_changed', listener);
    unsub();
    eventBus.publish(makeStatusEvent());
    expect(listener).not.toHaveBeenCalled();
  });

  it('calling unsubscribe twice does not throw', () => {
    const listener = vi.fn();
    const unsub = eventBus.subscribe('status_changed', listener);
    expect(() => { unsub(); unsub(); }).not.toThrow();
  });

  it('unsubscribing one listener does not affect others', () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    const unsub1 = eventBus.subscribe('status_changed', l1);
    eventBus.subscribe('status_changed', l2);
    unsub1();
    eventBus.publish(makeStatusEvent());
    expect(l1).not.toHaveBeenCalled();
    expect(l2).toHaveBeenCalledOnce();
  });

  it('resubscribing after unsubscribing works', () => {
    const listener = vi.fn();
    const unsub = eventBus.subscribe('status_changed', listener);
    unsub();
    eventBus.subscribe('status_changed', listener);
    eventBus.publish(makeStatusEvent());
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe('EventBus — clear', () => {
  it('clear removes all listeners across all event types', () => {
    const statusListener = vi.fn();
    const vitalsListener = vi.fn();
    eventBus.subscribe('status_changed', statusListener);
    eventBus.subscribe('vitals_updated', vitalsListener);
    eventBus.clear();
    eventBus.publish(makeStatusEvent());
    eventBus.publish(makeVitalsEvent());
    expect(statusListener).not.toHaveBeenCalled();
    expect(vitalsListener).not.toHaveBeenCalled();
  });

  it('clear on an already-empty bus does not throw', () => {
    expect(() => eventBus.clear()).not.toThrow();
  });

  it('can subscribe and publish after clear', () => {
    const listener = vi.fn();
    eventBus.subscribe('status_changed', listener);
    eventBus.clear();
    eventBus.subscribe('status_changed', listener);
    eventBus.publish(makeStatusEvent());
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe('EventBus — alert_raised and order_changed types', () => {
  it('alert_raised listener receives correct event', () => {
    const listener = vi.fn();
    eventBus.subscribe('alert_raised', listener);
    const event: DataEvent = {
      type: 'alert_raised',
      id: 'a-1',
      entityId: 'p-1',
      version: 1,
      ts: Date.now(),
      payload: { severity: 'critical', message: 'Code Blue' },
    };
    eventBus.publish(event);
    expect(listener).toHaveBeenCalledWith(event);
  });

  it('order_changed listener receives correct event', () => {
    const listener = vi.fn();
    eventBus.subscribe('order_changed', listener);
    const event: DataEvent = {
      type: 'order_changed',
      id: 'o-1',
      entityId: 'p-1',
      version: 1,
      ts: Date.now(),
      payload: { orderId: 'ord-1', description: 'blood panel', status: 'pending' },
    };
    eventBus.publish(event);
    expect(listener).toHaveBeenCalledWith(event);
  });
});
