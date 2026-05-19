import type { DbClient } from '../offline/db/client';

/**
 * Returns a fully synchronous in-memory DbClient backed by a plain JS map,
 * usable in Vitest without WASM or OPFS. Supports the small SQL subset used
 * by PatientRepository and QueueRepository.
 *
 * Only supports the exact statements emitted by those repos — this is NOT a
 * general SQL engine. Add cases here when a new repo query pattern appears.
 */
export function makeInMemoryDb(): DbClient & { _tables: Record<string, Record<string, unknown>[]> } {
  const tables: Record<string, Record<string, unknown>[]> = {
    patients: [],
    offline_queue: [],
    sync_meta: [],
  };

  function execCreate(): void { /* no-op — tables pre-created above */ }

  function runInsertPatient(params: readonly unknown[]): void {
    const [id, tenant_id, data, version, updated_at] = params as [string, string, string, number, number];
    const existing = tables.patients.findIndex((r) => r.id === id && r.tenant_id === tenant_id);
    const incomingVersion = version as number;
    if (existing >= 0) {
      const curr = tables.patients[existing] as { version: number };
      if (incomingVersion >= curr.version) {
        tables.patients[existing] = { id, tenant_id, data, version, updated_at };
      }
    } else {
      tables.patients.push({ id, tenant_id, data, version, updated_at });
    }
  }

  function runInsertQueue(params: readonly unknown[]): void {
    const [id, tenant_id, entity, entity_id, op, payload, created_at] = params as string[];
    tables.offline_queue.push({ id, tenant_id, entity, entity_id, op, payload, created_at: Number(created_at), retries: 0, status: 'pending', conflict_meta: null });
  }

  function runUpdateQueue(sql: string, params: readonly unknown[]): void {
    const id = params[params.length - 1] as string;
    const row = tables.offline_queue.find((r) => r.id === id);
    if (!row) return;
    if (sql.includes("status = 'synced'")) row.status = 'synced';
    if (sql.includes("status = 'conflict'")) {
      row.status = 'conflict';
      row.conflict_meta = params[0] as string;
    }
    if (sql.includes('retries = retries + 1')) row.retries = (row.retries as number) + 1;
  }

  function runSyncMeta(params: readonly unknown[]): void {
    const [tenant_id, last_sync_at] = params as [string, number];
    const existing = tables.sync_meta.findIndex((r) => r.tenant_id === tenant_id);
    if (existing >= 0) {
      tables.sync_meta[existing].last_sync_at = last_sync_at;
    } else {
      tables.sync_meta.push({ tenant_id, last_sync_at });
    }
  }

  return {
    _tables: tables,
    exec(_sql: string): void { execCreate(); },
    run(sql: string, params: readonly unknown[] = []): void {
      if (sql.includes('INSERT INTO patients')) { runInsertPatient(params); return; }
      if (sql.includes('INSERT INTO offline_queue')) { runInsertQueue(params); return; }
      if (sql.includes('UPDATE offline_queue')) { runUpdateQueue(sql, params); return; }
      if (sql.includes('DELETE FROM offline_queue')) {
        const [tenant_id] = params as [string];
        tables.offline_queue = tables.offline_queue.filter((r) => !(r.tenant_id === tenant_id && r.status === 'synced'));
        return;
      }
      if (sql.includes('INSERT INTO sync_meta') || sql.includes('sync_meta')) { runSyncMeta(params); return; }
    },
    query<T>(sql: string, params: readonly unknown[] = []): T[] {
      if (sql.includes('FROM patients')) {
        const [tenant_id] = params as [string];
        let rows = tables.patients.filter((r) => r.tenant_id === tenant_id);
        if (sql.includes("json_extract(data, '$.status') = ?")) {
          const [, status] = params as [string, string];
          rows = rows.filter((r) => {
            try { return (JSON.parse(r.data as string) as { status: string }).status === status; } catch { return false; }
          });
        }
        rows = rows.sort((a, b) => (b.updated_at as number) - (a.updated_at as number));
        return rows as unknown as T[];
      }
      if (sql.includes('FROM offline_queue')) {
        const [tenant_id] = params as [string];
        return tables.offline_queue
          .filter((r) => r.tenant_id === tenant_id && r.status === 'pending')
          .sort((a, b) => (a.created_at as number) - (b.created_at as number)) as unknown as T[];
      }
      return [];
    },
    queryOne<T>(sql: string, params: readonly unknown[] = []): T | null {
      if (sql.includes('FROM patients')) {
        const [tenant_id, id] = params as [string, string];
        return (tables.patients.find((r) => r.tenant_id === tenant_id && r.id === id) as T | undefined) ?? null;
      }
      if (sql.includes('COUNT(*)')) {
        const [tenant_id] = params as [string];
        const count = tables.offline_queue.filter((r) => r.tenant_id === tenant_id).length;
        return { count } as unknown as T;
      }
      if (sql.includes('sync_meta')) {
        const [tenant_id] = params as [string];
        return (tables.sync_meta.find((r) => r.tenant_id === tenant_id) as T | undefined) ?? null;
      }
      return null;
    },
    close(): void { /* no-op */ },
  };
}
