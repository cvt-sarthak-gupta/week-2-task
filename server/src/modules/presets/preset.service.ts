import type { InMemoryStore } from '../../infrastructure/inMemoryStore';
import type { PresetEntity } from './preset.entity';
import type { CreatePresetInput, UpdatePresetInput } from './preset.types';
import { PRESET_MESSAGES } from './preset.messages';
import { PresetHelper } from './preset.helper';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../core/errors/index';

export interface CreatePresetDto extends CreatePresetInput {
  tenantId: string;
  userId: string;
}

export class PresetService {
  constructor(private readonly store: InMemoryStore<PresetEntity>) {}

  listForUser(tenantId: string, userId: string): PresetEntity[] {
    return this.store.getAll(tenantId).filter((p) => p.userId === userId || p.isShared);
  }

  create(dto: CreatePresetDto): PresetEntity {
    if (!dto.name || !dto.filterAst) {
      throw new ValidationError(PRESET_MESSAGES.VALIDATION_REQUIRED);
    }
    const now = Date.now();
    const preset: PresetEntity = {
      id: PresetHelper.generateId(),
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

  update(tenantId: string, userId: string, id: string, dto: UpdatePresetInput): PresetEntity {
    const existing = this.store.get(tenantId, id);
    if (!existing) throw new NotFoundError(PRESET_MESSAGES.NOT_FOUND);

    if (existing.userId !== userId && !existing.isShared) {
      throw new ForbiddenError(PRESET_MESSAGES.FORBIDDEN);
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
    if (!existing) throw new NotFoundError(PRESET_MESSAGES.NOT_FOUND);
    if (existing.userId !== userId) throw new ForbiddenError(PRESET_MESSAGES.OWNER_ONLY_DELETE);
    this.store.delete(tenantId, id);
  }
}
