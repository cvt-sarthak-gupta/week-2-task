import type { DbClient } from '../client';
import type { Patient, PaginatedResult } from '@/shared/types';

export interface OfflinePatientFilters {
  status?: string;
  ward?: string;
  search?: string;
  sort?: string; // "field:ASC,field2:DESC"
}

interface PatientRow {
  id: string;
  tenant_id: string;
  data: string;
  version: number;
  updated_at: number;
}

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
      [patient.id, tenantId, JSON.stringify(patient), patient.version, Date.now()],
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

  findFiltered(tenantId: string, filters: OfflinePatientFilters, page = 1, limit = 200): PaginatedResult<Patient> {
    let patients = this.findAll(tenantId);

    if (filters.status) {
      patients = patients.filter((p) => p.status === filters.status);
    }
    if (filters.ward) {
      patients = patients.filter((p) => p.ward === filters.ward);
    }
    if (filters.search) {
      const term = filters.search.toLowerCase();
      patients = patients.filter(
        (p) =>
          p.firstName.toLowerCase().includes(term) ||
          p.lastName.toLowerCase().includes(term) ||
          p.mrn.toLowerCase().includes(term),
      );
    }
    if (filters.sort) {
      const sortParts = filters.sort.split(',').map((s) => {
        const [field, dir] = s.split(':');
        return { field: field ?? '', dir: (dir ?? 'ASC') as 'ASC' | 'DESC' };
      });
      patients = [...patients].sort((a, b) => {
        for (const { field, dir } of sortParts) {
          const av = (a as unknown as Record<string, unknown>)[field];
          const bv = (b as unknown as Record<string, unknown>)[field];
          let cmp = 0;
          if (typeof av === 'string' && typeof bv === 'string') cmp = av.localeCompare(bv);
          else if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
          if (cmp !== 0) return dir === 'ASC' ? cmp : -cmp;
        }
        return 0;
      });
    }

    const total = patients.length;
    const start = (page - 1) * limit;
    return {
      data: patients.slice(start, start + limit),
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
