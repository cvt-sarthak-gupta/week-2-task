import type { Patient, PatientStatus } from '@/shared/types';

/** Every server event carries these fields for ordering + dedup. */
interface BaseEvent {
  readonly id: string; // unique event id for dedup
  readonly entityId: string; // patient id
  readonly version: number; // monotonic per-entity version
  readonly ts: number; // server timestamp ms
}

export interface VitalsUpdatedEvent extends BaseEvent {
  readonly type: 'vitals_updated';
  readonly payload: { heartRate: number; bp: string; temp: number; o2sat: number };
}

export interface OrderChangedEvent extends BaseEvent {
  readonly type: 'order_changed';
  readonly payload: { orderId: string; description: string; status: string };
}

export interface AlertRaisedEvent extends BaseEvent {
  readonly type: 'alert_raised';
  readonly payload: { severity: 'low' | 'medium' | 'high' | 'critical'; message: string };
}

export interface StatusChangedEvent extends BaseEvent {
  readonly type: 'status_changed';
  readonly payload: { previousStatus: PatientStatus; newStatus: PatientStatus };
}

export interface PatientUpdatedEvent extends BaseEvent {
  readonly type: 'patient_updated';
  readonly payload: Partial<Patient>;
}

export interface HeartbeatEvent {
  readonly type: 'pong';
  readonly ts: number;
}

export type ServerEvent =
  | VitalsUpdatedEvent
  | OrderChangedEvent
  | AlertRaisedEvent
  | StatusChangedEvent
  | PatientUpdatedEvent
  | HeartbeatEvent;

export type DataEvent = Exclude<ServerEvent, HeartbeatEvent>;

export type EventType = ServerEvent['type'];
