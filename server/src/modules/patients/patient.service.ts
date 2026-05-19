import type { PatientEntity } from './patient.entity';
import type { PatientRepository } from './patient.repository';
import type { PaginatedResult } from '../../core/interfaces/repository.interface';
import { NotFoundError, ConflictError } from '../../core/errors/index';
import { v4 as uuidv4 } from 'uuid';
import { deserializeFilter } from '../../core/filter/filter-deserializer';
import { evaluateFilter } from '../../core/filter/filter-evaluator';

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

export class PatientService {
  constructor(private readonly repo: PatientRepository) {}

  async findAll(page = 1, limit = 20, filters: PatientFilterDto = {}): Promise<PaginatedResult<PatientEntity>> {
    // When a full AST filter is provided, evaluate it in-process against the full store
    // and paginate the result ourselves (bypassing the simple where/search path).
    if (filters.filterAst) {
      return this.findAllByAst(page, limit, filters);
    }

    const where: Partial<PatientEntity> = {};
    if (filters.status) where.status = filters.status as PatientEntity['status'];
    if (filters.ward) where.ward = filters.ward;

    const order: Partial<Record<keyof PatientEntity, 'ASC' | 'DESC'>> = {};
    if (filters.sort) {
      for (const part of filters.sort.split(',')) {
        const [field, dir] = part.split(':');
        if (field && (dir === 'ASC' || dir === 'DESC')) {
          order[field as keyof PatientEntity] = dir;
        }
      }
    }
    if (Object.keys(order).length === 0) order.updatedAt = 'DESC';

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

    let items = await this.repo.findAll({ page: 1, limit: Number.MAX_SAFE_INTEGER });
    let matched = items.data.filter((p) => evaluateFilter(ast, p as unknown as Record<string, unknown>));

    // Apply sort on top of AST results
    if (filters.sort) {
      const sortParts: Array<{ field: string; dir: 'ASC' | 'DESC' }> = [];
      for (const part of filters.sort.split(',')) {
        const [field, dir] = part.split(':');
        if (field && (dir === 'ASC' || dir === 'DESC')) sortParts.push({ field, dir });
      }
      if (sortParts.length > 0) {
        matched = matched.sort((a, b) => {
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
    }

    const total = matched.length;
    const start = (page - 1) * limit;
    const data = matched.slice(start, start + limit);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  async findById(id: string): Promise<PatientEntity> {
    const patient = await this.repo.findById(id);
    if (!patient) throw new NotFoundError(`Patient ${id} not found`);
    return patient;
  }

  async findSince(since: number): Promise<PatientEntity[]> {
    return this.repo.findSince(since);
  }

  async update(id: string, dto: UpdatePatientDto, expectedVersion?: number): Promise<PatientEntity> {
    const existing = await this.findById(id);

    // Optimistic locking: if version is provided, verify
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
