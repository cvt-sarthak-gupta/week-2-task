import type { DbClient } from '../client';
import type { Patient, PaginatedResult } from '@/shared/types';

export interface OfflinePatientFilters {
  status?: string;
  ward?: string;
  search?: string;
  sort?: string;
}

interface PatientRow {
  id: string;
  tenant_id: string;
  data: string;
  version: number;
  updated_at: number;
}

const SORTABLE_FIELDS = new Set<string>([
  'id', 'mrn', 'firstName', 'lastName', 'dob', 'age', 'sex',
  'status', 'ward', 'admittedAt', 'updatedAt', 'version',
  'heartRate', 'o2sat', 'temp',
]);

export class PatientRepository {
  constructor(private readonly db: DbClient) {}

  upsert(tenantId: string, patient: Patient): void {
    this.db.run(
      `INSERT INTO patients (id, tenant_id, data, version, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id, tenant_id) DO UPDATE SET
         data = excluded.data,
         version = excluded.version,
         updated_at = excluded.updated_at
       WHERE excluded.version >= patients.version`,
      [patient.id, tenantId, JSON.stringify(patient), patient.version, new Date(patient.updatedAt).getTime()],
    );
  }

  upsertMany(tenantId: string, patients: readonly Patient[]): void {
    for (const p of patients) this.upsert(tenantId, p);
  }

  findById(tenantId: string, id: string): Patient | null {
    const row = this.db.queryOne<PatientRow>(
      'SELECT * FROM patients WHERE tenant_id = ? AND id = ?',
      [tenantId, id],
    );
    return row ? (JSON.parse(row.data) as Patient) : null;
  }

  findAll(tenantId: string): Patient[] {
    const rows = this.db.query<PatientRow>('SELECT * FROM patients WHERE tenant_id = ? ORDER BY updated_at DESC', [tenantId]);
    return rows.map((r) => JSON.parse(r.data) as Patient);
  }

  findByStatus(tenantId: string, status: string): Patient[] {
    const rows = this.db.query<PatientRow>(
      `SELECT * FROM patients WHERE tenant_id = ? AND json_extract(data, '$.status') = ?`,
      [tenantId, status],
    );
    return rows.map((r) => JSON.parse(r.data) as Patient);
  }

  findFiltered(
    tenantId: string,
    filters: OfflinePatientFilters,
    page = 1,
    limit = 200,
    filterFn?: (patient: Patient) => boolean,
  ): PaginatedResult<Patient> {
    const whereParts: string[] = ['tenant_id = ?'];
    const baseParams: unknown[] = [tenantId];

    if (filters.status) {
      whereParts.push("json_extract(data, '$.status') = ?");
      baseParams.push(filters.status);
    }
    if (filters.ward) {
      whereParts.push("json_extract(data, '$.ward') = ?");
      baseParams.push(filters.ward);
    }
    if (filters.search) {
      const term = '%' + filters.search.toLowerCase() + '%';
      whereParts.push(
        "(LOWER(json_extract(data, '$.firstName')) LIKE ? OR LOWER(json_extract(data, '$.lastName')) LIKE ? OR LOWER(json_extract(data, '$.mrn')) LIKE ?)",
      );
      baseParams.push(term, term, term);
    }

    const where = whereParts.join(' AND ');

    let orderBy = 'updated_at DESC';
    if (filters.sort) {
      const sortParts = filters.sort.split(',').flatMap((s) => {
        const [field, dir] = s.split(':');
        if (!field || !SORTABLE_FIELDS.has(field)) return [];
        const safeDir = (dir ?? 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
        if (field === 'updatedAt') return [`updated_at ${safeDir}`];
        return [`json_extract(data, '$.${field}') ${safeDir}`];
      });
      if (sortParts.length > 0) orderBy = sortParts.join(', ');
    }

    if (filterFn) {
      const allRows = this.db.query<PatientRow>(
        `SELECT * FROM patients WHERE ${where} ORDER BY ${orderBy}`,
        baseParams,
      );
      const filtered = allRows
        .map((r) => JSON.parse(r.data) as Patient)
        .filter(filterFn);
      const total = filtered.length;
      const offset = (page - 1) * limit;
      return {
        data: filtered.slice(offset, offset + limit),
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      };
    }

    const countRow = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM patients WHERE ${where}`,
      baseParams,
    );
    const total = countRow?.count ?? 0;

    const offset = (page - 1) * limit;
    const rows = this.db.query<PatientRow>(
      `SELECT * FROM patients WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...baseParams, limit, offset],
    );

    return {
      data: rows.map((r) => JSON.parse(r.data) as Patient),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  delete(tenantId: string, id: string): void {
    this.db.run('DELETE FROM patients WHERE tenant_id = ? AND id = ?', [tenantId, id]);
  }

  countByTenant(tenantId: string): number {
    const row = this.db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM patients WHERE tenant_id = ?', [tenantId]);
    return row?.count ?? 0;
  }
}
