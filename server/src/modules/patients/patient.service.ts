import type { PatientEntity } from './patient.entity';
import type { PatientFilterDto, UpdatePatientDto } from './patient.types';
import type { PatientRepository } from './patient.repository';
import type { PaginatedResult } from '../../core/interfaces/repository.interface';
import { NotFoundError, ConflictError } from '../../core/errors/index';
import { deserializeFilter } from '../../core/filter/filter-deserializer';
import { evaluateFilter } from '../../core/filter/filter-evaluator';
import { PatientHelper } from './patient.helper';

const IN_MEMORY_RECORD_CAP = 100_000;

export class PatientService {
  constructor(private readonly repo: PatientRepository) {}

  async findAll(page = 1, limit = 20, filters: PatientFilterDto = {}): Promise<PaginatedResult<PatientEntity>> {
    if (filters.filterAst) {
      return this.findAllByAst(page, limit, filters);
    }

    const where: Partial<PatientEntity> = {};
    if (filters.status) where.status = filters.status as PatientEntity['status'];
    if (filters.ward) where.ward = filters.ward;

    const order = PatientHelper.buildOrder(filters.sort);

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
      matched = PatientHelper.applySortParts(
        matched as unknown as Record<string, unknown>[],
        PatientHelper.parseSortString(filters.sort),
      ) as unknown as PatientEntity[];
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
        matched = PatientHelper.applySortParts(
          matched as unknown as Record<string, unknown>[],
          PatientHelper.parseSortString(filters.sort),
        ) as unknown as PatientEntity[];
      }
      return matched;
    }

    const where: Partial<PatientEntity> = {};
    if (filters.status) where.status = filters.status as PatientEntity['status'];
    if (filters.ward) where.ward = filters.ward;

    const order = PatientHelper.buildOrder(filters.sort);

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
