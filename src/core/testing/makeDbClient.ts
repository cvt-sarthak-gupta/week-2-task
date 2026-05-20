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
  const tables: {
    patients: Record<string, unknown>[];
    offline_queue: Record<string, unknown>[];
    sync_meta: Record<string, unknown>[];
  } = {
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
      tables.sync_meta[existing]!.last_sync_at = last_sync_at;
    } else {
      tables.sync_meta.push({ tenant_id, last_sync_at });
    }
  }

  // -------------------------------------------------------------------------
  // Patient filter helpers
  // -------------------------------------------------------------------------

  function applyPatientFilters(
    sql: string,
    params: readonly unknown[],
    rows: Record<string, unknown>[],
  ): { rows: Record<string, unknown>[]; paramIdx: number } {
    let paramIdx = 0;
    const tenantId = params[paramIdx++] as string;
    let filtered = rows.filter((r) => r.tenant_id === tenantId);

    const hasStatus = sql.includes("json_extract(data, '$.status') = ?");
    const hasWard = sql.includes("json_extract(data, '$.ward') = ?");
    const hasSearch = sql.includes('LIKE ?');

    if (hasStatus) {
      const status = params[paramIdx++] as string;
      filtered = filtered.filter((r) => {
        try { return (JSON.parse(r.data as string) as { status: string }).status === status; } catch { return false; }
      });
    }
    if (hasWard) {
      const ward = params[paramIdx++] as string;
      filtered = filtered.filter((r) => {
        try { return (JSON.parse(r.data as string) as { ward: string }).ward === ward; } catch { return false; }
      });
    }
    if (hasSearch) {
      const term = (params[paramIdx] as string).replace(/%/g, '').toLowerCase();
      paramIdx += 3;
      filtered = filtered.filter((r) => {
        try {
          const d = JSON.parse(r.data as string) as { firstName: string; lastName: string; mrn: string };
          return (
            d.firstName.toLowerCase().includes(term) ||
            d.lastName.toLowerCase().includes(term) ||
            d.mrn.toLowerCase().includes(term)
          );
        } catch { return false; }
      });
    }

    return { rows: filtered, paramIdx };
  }

  function applySortFromSql(sql: string, rows: Record<string, unknown>[]): Record<string, unknown>[] {
    const match = sql.match(/ORDER BY (.+?) LIMIT/s);
    if (!match) {
      // Default sort: updated_at DESC
      return [...rows].sort((a, b) => (b.updated_at as number) - (a.updated_at as number));
    }

    const orderByClause = match[1]!;
    const sortKeys: { field: string; dir: string }[] = [];

    // Split on commas that are NOT inside parentheses
    const sortParts: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of orderByClause) {
      if (ch === '(') { depth++; current += ch; }
      else if (ch === ')') { depth--; current += ch; }
      else if (ch === ',' && depth === 0) { sortParts.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    if (current.trim()) sortParts.push(current.trim());

    for (const part of sortParts) {
      const trimmed = part.trim();
      const jsonMatch = trimmed.match(/json_extract\(data,\s*'[$]\.(\w+)'\)\s+(ASC|DESC)/i);
      if (jsonMatch) {
        sortKeys.push({ field: jsonMatch[1]!, dir: jsonMatch[2]!.toUpperCase() });
        continue;
      }
      const colMatch = trimmed.match(/^updated_at\s+(ASC|DESC)$/i);
      if (colMatch) {
        sortKeys.push({ field: 'updated_at', dir: colMatch[1]!.toUpperCase() });
        continue;
      }
    }

    if (sortKeys.length === 0) {
      return [...rows].sort((a, b) => (b.updated_at as number) - (a.updated_at as number));
    }

    return [...rows].sort((a, b) => {
      for (const { field, dir } of sortKeys) {
        let av: unknown;
        let bv: unknown;
        if (field === 'updated_at') {
          av = a.updated_at;
          bv = b.updated_at;
        } else {
          try { av = (JSON.parse(a.data as string) as Record<string, unknown>)[field]; } catch { av = undefined; }
          try { bv = (JSON.parse(b.data as string) as Record<string, unknown>)[field]; } catch { bv = undefined; }
        }
        let cmp = 0;
        if (typeof av === 'string' && typeof bv === 'string') cmp = av.localeCompare(bv);
        else if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
        if (cmp !== 0) return dir === 'DESC' ? -cmp : cmp;
      }
      return 0;
    });
  }

  return {
    _tables: tables,
    exec(_sql: string): void { execCreate(); },
    run(sql: string, params: readonly unknown[] = []): void {
      if (sql.includes('INSERT INTO patients')) { runInsertPatient(params); return; }
      if (sql.includes('INSERT INTO offline_queue')) { runInsertQueue(params); return; }
      if (sql.includes('UPDATE offline_queue')) { runUpdateQueue(sql, params); return; }
      if (sql.includes('DELETE FROM patients')) {
        const [tenant_id, id] = params as [string, string];
        tables.patients = tables.patients.filter((r) => !(r.tenant_id === tenant_id && r.id === id));
        return;
      }
      if (sql.includes('DELETE FROM offline_queue')) {
        const [tenant_id] = params as [string];
        tables.offline_queue = tables.offline_queue.filter((r) => !(r.tenant_id === tenant_id && r.status === 'synced'));
        return;
      }
      if (sql.includes('INSERT INTO sync_meta') || sql.includes('sync_meta')) { runSyncMeta(params); return; }
    },
    query<T>(sql: string, params: readonly unknown[] = []): T[] {
      if (sql.includes('FROM patients')) {
        if (sql.includes('LIMIT')) {
          // Paged + filtered query from findFiltered
          const { rows: filtered, paramIdx } = applyPatientFilters(sql, params, tables.patients);
          const sorted = applySortFromSql(sql, filtered);
          const limit = params[paramIdx] as number;
          const offset = params[paramIdx + 1] as number;
          return sorted.slice(offset, offset + limit) as unknown as T[];
        }
        // Non-paged query (findAll, findByStatus, etc.) — use applyPatientFilters for consistency
        const { rows: filtered } = applyPatientFilters(sql, params, tables.patients);
        const sorted = filtered.sort((a, b) => (b.updated_at as number) - (a.updated_at as number));
        return sorted as unknown as T[];
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
      if (sql.includes('COUNT(*)') && sql.includes('FROM patients')) {
        const { rows: filtered } = applyPatientFilters(sql, params, tables.patients);
        return { count: filtered.length } as unknown as T;
      }
      if (sql.includes('FROM patients')) {
        const [tenant_id, id] = params as [string, string];
        return (tables.patients.find((r) => r.tenant_id === tenant_id && r.id === id) as T | undefined) ?? null;
      }
      if (sql.includes('COUNT(*)') && sql.includes('FROM offline_queue')) {
        const [tenant_id] = params as [string];
        const status = params.length > 1 ? (params[1] as string) : null;
        const count = tables.offline_queue.filter(
          (r) => r.tenant_id === tenant_id && (status === null || r.status === status),
        ).length;
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
