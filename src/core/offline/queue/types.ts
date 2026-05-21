export type OpType = 'create' | 'update' | 'delete';
export type QueueEntryStatus = 'pending' | 'synced' | 'conflict' | 'failed';

export interface QueueEntry {
  readonly id: string;
  readonly tenantId: string;
  readonly entity: string;
  readonly entityId: string;
  readonly op: OpType;
  readonly payload: unknown;
  readonly createdAt: number;
  readonly retries: number;
  readonly status: QueueEntryStatus;
  readonly conflictMeta?: ConflictMeta | undefined;
}

export interface ConflictMeta {
  readonly serverVersion: number;
  readonly serverPayload: unknown;
}
