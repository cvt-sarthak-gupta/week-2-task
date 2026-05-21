import { MIGRATION_0001 } from './schema.sql';

export interface DbClient {
  exec(sql: string): void;
  run(sql: string, params?: readonly unknown[]): void;
  query<T>(sql: string, params?: readonly unknown[]): T[];
  queryOne<T>(sql: string, params?: readonly unknown[]): T | null;
  close(): void;
}

let dbInstance: DbClient | null = null;
let initPromise: Promise<DbClient> | null = null;

type Oo1DB = {
  exec: (...args: unknown[]) => unknown;
  close(): void;
};
type Sqlite3Static = { oo1: { DB: new (name: string, flags: string) => Oo1DB } };

type Oo1Namespace = { DB: new (name: string, flags: string) => Oo1DB; OpfsDb?: new (path: string) => Oo1DB };

async function openSqlite3(): Promise<DbClient> {
  const mod = (await import('@sqlite.org/sqlite-wasm')) as { default: (opts: unknown) => Promise<Sqlite3Static & { oo1: Oo1Namespace }> };
  const sqlite3 = await mod.default({
    print: () => {},
    printErr: (msg: string) => console.error('[sqlite3]', msg),
    locateFile: (f: string) => `/${f}`,
  });

  if (sqlite3.oo1.OpfsDb) {
    try {
      const db = new sqlite3.oo1.OpfsDb('/healthcare-dashboard.sqlite3');
      console.info('[offline] Using OPFS-backed SQLite (persistent)');
      return wrapOo1(db);
    } catch (err) {
      console.warn('[offline] OPFS unavailable, falling back to in-memory SQLite:', err);
    }
  }

  const db = new sqlite3.oo1.DB(':memory:', 'ct');
  return wrapOo1(db);
}

function wrapOo1(db: Oo1DB): DbClient {
  return {
    exec(sql: string): void {
      db.exec(sql);
    },
    run(sql: string, params?: readonly unknown[]): void {
      db.exec({ sql, bind: params ?? [] });
    },
    query<T>(sql: string, params?: readonly unknown[]): T[] {
      const rows = db.exec({ sql, bind: params ?? [], rowMode: 'object', returnValue: 'resultRows' });
      return (rows as T[]) ?? [];
    },
    queryOne<T>(sql: string, params?: readonly unknown[]): T | null {
      return this.query<T>(sql, params)[0] ?? null;
    },
    close(): void {
      db.close();
    },
  };
}

async function runMigrations(client: DbClient): Promise<void> {
  client.exec(MIGRATION_0001);
  client.run('INSERT OR IGNORE INTO _meta_migrations (version, applied_at) VALUES (?, ?)', [1, Date.now()]);
}

export async function getDb(): Promise<DbClient> {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const client = await openSqlite3();
      await runMigrations(client);
      dbInstance = client;
      return client;
    } catch (err) {
      console.warn('[offline] SQLite WASM unavailable, using in-memory fallback:', err);
      const fallback = createInMemoryStore();
      await runMigrations(fallback);
      dbInstance = fallback;
      return fallback;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export function resetDb(): void {
  dbInstance?.close();
  dbInstance = null;
}

function createInMemoryStore(): DbClient {
  const patients = new Map<string, Record<string, unknown>>();
  const queue    = new Map<string, Record<string, unknown>>();
  const syncMeta = new Map<string, number>();

  const pKey = (tenantId: string, id: string) => `${tenantId}:${id}`;

  return {
    exec(_sql: string): void {
    },

    run(sql: string, params?: readonly unknown[]): void {
      const p = (params ?? []) as unknown[];

      if (/INSERT INTO patients/.test(sql)) {
        const key = pKey(p[1] as string, p[0] as string);
        const existing = patients.get(key);
        if (existing && typeof existing['version'] === 'number' && (p[3] as number) < (existing['version'] as number)) return;
        patients.set(key, { id: p[0], tenant_id: p[1], data: p[2], version: p[3], updated_at: p[4] });

      } else if (/DELETE FROM patients/.test(sql)) {
        patients.delete(pKey(p[0] as string, p[1] as string));

      } else if (/INSERT INTO offline_queue/.test(sql)) {
        queue.set(p[0] as string, {
          id: p[0], tenant_id: p[1], entity: p[2], entity_id: p[3],
          op: p[4], payload: p[5], created_at: p[6], retries: 0, status: 'pending', conflict_meta: null,
        });

      } else if (/UPDATE offline_queue SET status = 'synced'/.test(sql)) {
        const e = queue.get(p[0] as string);
        if (e) queue.set(p[0] as string, { ...e, status: 'synced' });

      } else if (/UPDATE offline_queue SET status = 'conflict'/.test(sql)) {
        const e = queue.get(p[1] as string);
        if (e) queue.set(p[1] as string, { ...e, status: 'conflict', conflict_meta: p[0] });

      } else if (/UPDATE offline_queue SET retries/.test(sql)) {
        const e = queue.get(p[0] as string);
        if (e) queue.set(p[0] as string, { ...e, retries: ((e['retries'] as number) ?? 0) + 1 });

      } else if (/DELETE FROM offline_queue/.test(sql)) {
        for (const [k, v] of queue) {
          if (v['tenant_id'] === p[0] && v['status'] === 'synced') queue.delete(k);
        }

      } else if (/INSERT INTO sync_meta/.test(sql)) {
        syncMeta.set(p[0] as string, p[1] as number);
      }
    },

    query<T>(sql: string, params?: readonly unknown[]): T[] {
      const p = (params ?? []) as unknown[];

      if (/SELECT \* FROM patients WHERE tenant_id = \? ORDER BY/.test(sql)) {
        const tid = p[0] as string;
        return Array.from(patients.values())
          .filter(r => r['tenant_id'] === tid)
          .sort((a, b) => (b['updated_at'] as number) - (a['updated_at'] as number)) as T[];
      }

      if (/SELECT \* FROM offline_queue WHERE tenant_id = \? AND status = 'pending'/.test(sql)) {
        const tid = p[0] as string;
        return Array.from(queue.values())
          .filter(r => r['tenant_id'] === tid && r['status'] === 'pending')
          .sort((a, b) => (a['created_at'] as number) - (b['created_at'] as number)) as T[];
      }

      if (/json_extract/.test(sql)) {
        const tid = p[0] as string;
        const status = p[1] as string;
        return Array.from(patients.values()).filter(r => {
          if (r['tenant_id'] !== tid) return false;
          try { return (JSON.parse(r['data'] as string) as { status: string }).status === status; } catch { return false; }
        }) as T[];
      }

      return [];
    },

    queryOne<T>(sql: string, params?: readonly unknown[]): T | null {
      const p = (params ?? []) as unknown[];

      if (/SELECT \* FROM patients WHERE tenant_id = \? AND id = \?/.test(sql)) {
        return (patients.get(pKey(p[0] as string, p[1] as string)) ?? null) as T | null;
      }

      if (/SELECT last_sync_at FROM sync_meta/.test(sql)) {
        const v = syncMeta.get(p[0] as string);
        return v !== undefined ? ({ last_sync_at: v } as T) : null;
      }

      if (/SELECT COUNT\(\*\) as count FROM patients/.test(sql)) {
        const count = Array.from(patients.values()).filter(r => r['tenant_id'] === p[0]).length;
        return { count } as T;
      }

      if (/SELECT COUNT\(\*\) as count FROM offline_queue WHERE tenant_id = \? AND status/.test(sql)) {
        const count = Array.from(queue.values()).filter(r => r['tenant_id'] === p[0] && r['status'] === p[1]).length;
        return { count } as T;
      }

      if (/SELECT COUNT\(\*\) as count FROM offline_queue WHERE tenant_id = \?/.test(sql)) {
        const count = Array.from(queue.values()).filter(r => r['tenant_id'] === p[0]).length;
        return { count } as T;
      }

      return this.query<T>(sql, params)[0] ?? null;
    },

    close(): void {
      patients.clear();
      queue.clear();
      syncMeta.clear();
    },
  };
}
