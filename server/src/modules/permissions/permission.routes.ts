import type { Router } from 'express';
import { BaseApiRoutes } from '../../core/base/base.routes';
import PermissionController from './permission.controller';
import PermissionValidator from './permission.validator';
import { PermissionAuthMiddleware } from './permission.auth';
import { PermissionService } from './permission.service';
import { authMiddleware } from '../auth/auth.middleware';

const service    = new PermissionService();
const controller = new PermissionController(service);
const validator  = new PermissionValidator();
const auth       = new PermissionAuthMiddleware();

export default class PermissionRoutes extends BaseApiRoutes {
  constructor() {
    super('');
  }

  protected initializeRoutes(): void {
    this.router.get(
      '/me/config',
      authMiddleware,
      (req, res) => void controller.show(req, res),
    );

    this.router.patch(
      '/admin/feature-flags',
      authMiddleware,
      auth.canManageFlags.bind(auth),
      validator.middleware('updateFlags', 'body'),
      (req, res) => void controller.update(req, res),
    );

    this.router.patch(
      '/admin/layout/columns',
      authMiddleware,
      auth.canManageFlags.bind(auth),
      validator.middleware('updateColumns', 'body'),
      (req, res) => void controller.updateColumns(req, res),
    );
  }
}

export function createPermissionsRouter(): Router {
  return new PermissionRoutes().getRouter();
}
