import type { Router } from 'express';
import { BaseApiRoutes } from '../../core/base/base.routes';
import PresetController from './preset.controller';
import PresetValidator from './preset.validator';
import { PresetAuthMiddleware } from './preset.auth';
import { InMemoryStore } from '../../infrastructure/inMemoryStore';
import type { PresetEntity } from './preset.entity';
import { PresetService } from './preset.service';
import { authMiddleware } from '../auth/auth.middleware';

const store = new InMemoryStore<PresetEntity>();
const service = new PresetService(store);
const controller = new PresetController(service);
const validator = new PresetValidator();
const auth = new PresetAuthMiddleware(store);

export default class PresetRoutes extends BaseApiRoutes {
  constructor() {
    super('/presets');
  }

  protected initializeRoutes(): void {
    this.addRestRoutes(controller, {
      index: [
        authMiddleware,
      ],
      create: [
        authMiddleware,
        validator.middleware('create', 'body'),
      ],
      update: [
        authMiddleware,
        validator.middleware('id', 'params'),
        validator.middleware('update', 'body'),
        auth.canEdit.bind(auth),
      ],
      destroy: [
        authMiddleware,
        validator.middleware('id', 'params'),
      ],
    });
  }
}

export function createPresetsRouter(): Router {
  return new PresetRoutes().getRouter();
}
