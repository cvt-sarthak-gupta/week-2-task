import { randomUUID } from 'node:crypto';
import type { InMemoryStore } from '../../infrastructure/inMemoryStore';
import type { PresetEntity } from './preset.entity';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../core/errors/index';

export interface CreatePresetDto {
  name: string;
  filterAst: string;
  isShared: boolean;
  tenantId: string;
  userId: string;
}

export interface UpdatePresetDto {
  name?: string;
  filterAst?: string;
  isShared?: boolean;
  version?: number;
  force?: boolean;
}

export class PresetService {
  constructor(private readonly store: InMemoryStore<PresetEntity>) {}

  listForUser(tenantId: string, userId: string): PresetEntity[] {
    return this.store.getAll(tenantId).filter((p) => p.userId === userId || p.isShared);
  }

  create(dto: CreatePresetDto): PresetEntity {
    if (!dto.name || !dto.filterAst) {
      throw new ValidationError('name and filterAst are required');
    }
    const now = Date.now();
    const preset: PresetEntity = {
      id: randomUUID(),
      tenantId: dto.tenantId,
      userId: dto.userId,
      name: dto.name,
      filterAst: dto.filterAst,
      isShared: dto.isShared,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(dto.tenantId, preset);
    return preset;
  }

  update(tenantId: string, userId: string, id: string, dto: UpdatePresetDto): PresetEntity {
    const existing = this.store.get(tenantId, id);
    if (!existing) throw new NotFoundError('Preset not found');

    if (existing.userId !== userId && !existing.isShared) {
      throw new ForbiddenError('You do not have permission to edit this preset');
    }

    if (!dto.force && dto.version !== undefined && dto.version !== existing.version) {
      throw new ConflictError(
        { serverVersion: existing.version, serverPayload: existing },
        'Preset was modified by another session',
      );
    }

    const updated: PresetEntity = {
      ...existing,
      name: dto.name ?? existing.name,
      filterAst: dto.filterAst ?? existing.filterAst,
      isShared: dto.isShared ?? existing.isShared,
      version: existing.version + 1,
      updatedAt: Date.now(),
    };

    this.store.set(tenantId, updated);
    return updated;
  }

  delete(tenantId: string, userId: string, id: string): void {
    const existing = this.store.get(tenantId, id);
    if (!existing) throw new NotFoundError('Preset not found');
    if (existing.userId !== userId) throw new ForbiddenError('Only the owner can delete a preset');
    this.store.delete(tenantId, id);
  }
}
