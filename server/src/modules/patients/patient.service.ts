import type { PatientEntity } from './patient.entity';
import type { PatientRepository } from './patient.repository';
import type { PaginatedResult } from '../../core/interfaces/repository.interface';
import { NotFoundError, ConflictError } from '../../core/errors/index';
import { deserializeFilter } from '../../core/filter/filter-deserializer';
import { evaluateFilter } from '../../core/filter/filter-evaluator';

// Hard cap on the number of records loaded into memory for in-process AST filtering
// and unbounded exports. Prevents accidental OOM on unexpectedly large datasets.
// A real DB-backed implementation would replace this with cursor-based streaming.
const IN_MEMORY_RECORD_CAP = 100_000;

export interface UpdatePatientDto {
  status?: PatientEntity['status'];
  notes?: string;
  assignedCoordinatorId?: string;
  heartRate?: number;
  bp?: string;
  temp?: number;
  o2sat?: number;
}

export interface PatientFilterDto {
  status?: string;
  ward?: string;
  search?: string;
  sort?: string;   // "field:ASC|DESC,field2:ASC|DESC"
  filterAst?: string; // serialized FilterNode — takes precedence over flat params when present
}

type SortEntry = { field: string; dir: 'ASC' | 'DESC' };

export class PatientService {
  constructor(private readonly repo: PatientRepository) {}

  /** Parse "field:ASC,field2:DESC" into a structured sort list. */
  private parseSortParts(sort: string): SortEntry[] {
    return sort.split(',').flatMap((part) => {
      const [field, dir] = part.split(':');
      if (field && (dir === 'ASC' || dir === 'DESC')) return [{ field, dir }];
      return [];
    });
  }

  /** In-memory sort of an array of records using a structured sort list. */
  private applySortParts<T extends Record<string, unknown>>(items: T[], sortParts: SortEntry[]): T[] {
    if (sortParts.length === 0) return items;
    return [...items].sort((a, b) => {
      for (const { field, dir } of sortParts) {
        const av = a[field];
        const bv = b[field];
        let cmp = 0;
        if (typeof av === 'string' && typeof bv === 'string') cmp = av.localeCompare(bv);
        else if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
        if (cmp !== 0) return dir === 'ASC' ? cmp : -cmp;
      }
      return 0;
    });
  }

  async findAll(page = 1, limit = 20, filters: PatientFilterDto = {}): Promise<PaginatedResult<PatientEntity>> {
    if (filters.filterAst) {
      return this.findAllByAst(page, limit, filters);
    }

    const where: Partial<PatientEntity> = {};
    if (filters.status) where.status = filters.status as PatientEntity['status'];
    if (filters.ward) where.ward = filters.ward;

    const sortParts = filters.sort ? this.parseSortParts(filters.sort) : [];
    const order: Partial<Record<keyof PatientEntity, 'ASC' | 'DESC'>> =
      sortParts.length > 0
        ? Object.fromEntries(sortParts.map(({ field, dir }) => [field, dir])) as Partial<Record<keyof PatientEntity, 'ASC' | 'DESC'>>
        : { updatedAt: 'DESC' };

    const search = filters.search
      ? { term: filters.search, fields: ['firstName', 'lastName', 'mrn'] as (keyof PatientEntity)[] }
      : undefined;

    return this.repo.findAll({
      page,
      limit,
      ...(Object.keys(where).length > 0 && { where }),
      order,
      ...(search && { search }),
    });
  }

  private async findAllByAst(page: number, limit: number, filters: PatientFilterDto): Promise<PaginatedResult<PatientEntity>> {
    let ast;
    try {
      ast = deserializeFilter(filters.filterAst!);
    } catch {
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }

    const items = await this.repo.findAll({ page: 1, limit: IN_MEMORY_RECORD_CAP });
    let matched = items.data.filter((p) => evaluateFilter(ast, p as unknown as Record<string, unknown>));

    if (filters.sort) {
      matched = this.applySortParts(matched as unknown as Record<string, unknown>[], this.parseSortParts(filters.sort)) as unknown as PatientEntity[];
    }

    const total = matched.length;
    const start = (page - 1) * limit;
    return { data: matched.slice(start, start + limit), total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  async findById(id: string): Promise<PatientEntity> {
    const patient = await this.repo.findById(id);
    if (!patient) throw new NotFoundError(`Patient ${id} not found`);
    return patient;
  }

  async findSince(since: number): Promise<PatientEntity[]> {
    return this.repo.findSince(since);
  }

  async exportAll(filters: PatientFilterDto = {}): Promise<PatientEntity[]> {
    if (filters.filterAst) {
      let ast;
      try {
        ast = deserializeFilter(filters.filterAst);
      } catch {
        return [];
      }
      const items = await this.repo.findAll({ page: 1, limit: IN_MEMORY_RECORD_CAP });
      let matched = items.data.filter((p) => evaluateFilter(ast, p as unknown as Record<string, unknown>));
      if (filters.sort) {
        matched = this.applySortParts(matched as unknown as Record<string, unknown>[], this.parseSortParts(filters.sort)) as unknown as PatientEntity[];
      }
      return matched;
    }

    const where: Partial<PatientEntity> = {};
    if (filters.status) where.status = filters.status as PatientEntity['status'];
    if (filters.ward) where.ward = filters.ward;

    const sortParts = filters.sort ? this.parseSortParts(filters.sort) : [];
    const order: Partial<Record<keyof PatientEntity, 'ASC' | 'DESC'>> =
      sortParts.length > 0
        ? Object.fromEntries(sortParts.map(({ field, dir }) => [field, dir])) as Partial<Record<keyof PatientEntity, 'ASC' | 'DESC'>>
        : { updatedAt: 'DESC' };

    const search = filters.search
      ? { term: filters.search, fields: ['firstName', 'lastName', 'mrn'] as (keyof PatientEntity)[] }
      : undefined;

    const result = await this.repo.findAll({
      page: 1,
      limit: IN_MEMORY_RECORD_CAP,
      ...(Object.keys(where).length > 0 && { where }),
      order,
      ...(search && { search }),
    });
    return result.data;
  }

  async findAllForStream(): Promise<PatientEntity[]> {
    const result = await this.repo.findAll({
      page: 1,
      limit: IN_MEMORY_RECORD_CAP,
      order: { updatedAt: 'DESC' },
    });
    return result.data;
  }

  async update(id: string, dto: UpdatePatientDto, expectedVersion?: number): Promise<PatientEntity> {
    const existing = await this.findById(id);

    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new ConflictError(
        { serverVersion: existing.version, serverPayload: existing },
        'Conflict: patient was modified concurrently',
      );
    }

    const updated: PatientEntity = {
      ...existing,
      ...dto,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    return this.repo.save(updated);
  }
}
