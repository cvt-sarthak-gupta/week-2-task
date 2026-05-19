import type { DbClient } from '../client';
import type { QueueEntry, QueueEntryStatus } from '../../queue/types';

interface QueueRow {
  id: string;
  tenant_id: string;
  entity: string;
  entity_id: string;
  op: string;
  payload: string;
  created_at: number;
  retries: number;
  status: string;
  conflict_meta: string | null;
}

function rowToEntry(row: QueueRow): QueueEntry {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    entity: row.entity,
    entityId: row.entity_id,
    op: row.op as QueueEntry['op'],
    payload: JSON.parse(row.payload) as unknown,
    createdAt: row.created_at,
    retries: row.retries,
    status: row.status as QueueEntryStatus,
    conflictMeta: row.conflict_meta ? (JSON.parse(row.conflict_meta) as QueueEntry['conflictMeta']) : undefined,
  };
}

export class QueueRepository {
  constructor(private readonly db: DbClient) {}

  enqueue(entry: Omit<QueueEntry, 'retries' | 'status'>): void {
    this.db.run(
      `INSERT INTO offline_queue (id, tenant_id, entity, entity_id, op, payload, created_at, retries, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'pending')`,
      [entry.id, entry.tenantId, entry.entity, entry.entityId, entry.op, JSON.stringify(entry.payload), entry.createdAt],
    );
  }

  getPending(tenantId: string): QueueEntry[] {
    const rows = this.db.query<QueueRow>(
      `SELECT * FROM offline_queue WHERE tenant_id = ? AND status = 'pending' ORDER BY created_at ASC`,
      [tenantId],
    );
    return rows.map(rowToEntry);
  }

  markSynced(id: string): void {
    this.db.run(`UPDATE offline_queue SET status = 'synced' WHERE id = ?`, [id]);
  }

  markConflict(id: string, conflictMeta: QueueEntry['conflictMeta']): void {
    this.db.run(
      `UPDATE offline_queue SET status = 'conflict', conflict_meta = ? WHERE id = ?`,
      [JSON.stringify(conflictMeta), id],
    );
  }

  incrementRetries(id: string): void {
    this.db.run(`UPDATE offline_queue SET retries = retries + 1 WHERE id = ?`, [id]);
  }

  clear(tenantId: string): void {
    this.db.run(`DELETE FROM offline_queue WHERE tenant_id = ? AND status = 'synced'`, [tenantId]);
  }

  count(tenantId: string, status?: QueueEntryStatus): number {
    if (status) {
      const row = this.db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM offline_queue WHERE tenant_id = ? AND status = ?', [tenantId, status]);
      return row?.count ?? 0;
    }
    const row = this.db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM offline_queue WHERE tenant_id = ?', [tenantId]);
    return row?.count ?? 0;
  }
}
