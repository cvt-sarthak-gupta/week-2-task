import type { DataEvent } from '../realtime/events.types';
import type { Patient } from '@/shared/types';

// Messages from main thread → worker
export type WorkerRequest =
  | { type: 'init'; tenantId: string }
  | { type: 'raw_event'; payload: DataEvent }
  | { type: 'set_dataset'; patients: readonly Patient[] }
  | { type: 'filter'; ast: unknown; requestId: string };

// Messages from worker → main thread
export type WorkerResponse =
  | { type: 'batch_update'; updates: readonly PatientUpdate[]; frameTs: number }
  | { type: 'filter_result'; ids: readonly string[]; requestId: string }
  | { type: 'passthrough_event'; event: import('../realtime/events.types').DataEvent }
  | { type: 'ready' };

export interface PatientUpdate {
  readonly id: string;
  readonly patch: Partial<Patient>;
  readonly version: number;
}
