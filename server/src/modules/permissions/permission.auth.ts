import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../../core/errors/index';
import { PERMISSION_MESSAGES } from './permission.messages';

export class PermissionAuthMiddleware {
  canManageFlags(req: Request, res: Response, next: NextFunction): void {
    if (!req.ctx.capabilities.includes('manageFeatureFlags')) {
      const err = new ForbiddenError(PERMISSION_MESSAGES.FORBIDDEN_FLAGS);
      res.status(err.statusCode).json(err.json());
      return;
    }
    next();
  }
}
