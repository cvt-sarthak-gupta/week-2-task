export const MIGRATION_0001 = `
CREATE TABLE IF NOT EXISTS _meta_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER NOT NULL UNIQUE,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS patients (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  data TEXT NOT NULL,    -- JSON blob of Patient record
  version INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_patients_tenant ON patients (tenant_id);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients (tenant_id, json_extract(data, '$.status'));
CREATE INDEX IF NOT EXISTS idx_patients_updated ON patients (tenant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS offline_queue (
  id TEXT NOT NULL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  op TEXT NOT NULL,       -- 'create' | 'update' | 'delete'
  payload TEXT NOT NULL,  -- JSON
  created_at INTEGER NOT NULL,
  retries INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'synced' | 'conflict' | 'failed'
  conflict_meta TEXT      -- JSON, set when status='conflict'
);
CREATE INDEX IF NOT EXISTS idx_queue_tenant_status ON offline_queue (tenant_id, status, created_at ASC);

CREATE TABLE IF NOT EXISTS conflicts (
  id TEXT NOT NULL PRIMARY KEY,
  entity_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  local_version INTEGER NOT NULL,
  server_version INTEGER NOT NULL,
  local_payload TEXT NOT NULL,
  server_payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  resolution TEXT         -- 'local' | 'server' | 'merged' | null (unresolved)
);

CREATE TABLE IF NOT EXISTS sync_meta (
  tenant_id TEXT NOT NULL PRIMARY KEY,
  last_sync_at INTEGER NOT NULL DEFAULT 0,
  last_event_id TEXT
);
`;
