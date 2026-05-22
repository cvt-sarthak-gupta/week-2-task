import type { Request, Response, NextFunction } from 'express';
import { CustomError, NotFoundError, ForbiddenError } from '../../core/errors/index';
import type { InMemoryStore } from '../../infrastructure/inMemoryStore';
import type { PresetEntity } from './preset.entity';
import { PRESET_MESSAGES } from './preset.messages';

export class PresetAuthMiddleware {
  constructor(private readonly store: InMemoryStore<PresetEntity>) {}

  canEdit(req: Request, res: Response, next: NextFunction): void {
    try {
      const { id } = req.validatedData as { id: string };
      const existing = this.store.get(req.ctx.tenantId, id);

      if (!existing) throw new NotFoundError(PRESET_MESSAGES.NOT_FOUND);
      if (existing.userId !== req.ctx.currentUser.id && !existing.isShared) {
        throw new ForbiddenError(PRESET_MESSAGES.FORBIDDEN);
      }
      next();
    } catch (error) {
      if (error instanceof CustomError) {
        res.status(error.statusCode).json(error.json());
      } else {
        res.status(500).json({ status: 'error', message: 'Internal server error' });
      }
    }
  }
}
