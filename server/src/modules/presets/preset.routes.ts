import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import { InMemoryStore } from '../../infrastructure/inMemoryStore';
import type { PresetEntity } from './preset.entity';
import { PresetService } from './preset.service';
import { BaseController } from '../../core/base/base.controller';

const store = new InMemoryStore<PresetEntity>();
const service = new PresetService(store);

class PresetController extends BaseController {
  list(req: Request, res: Response): void {
    try {
      const presets = service.listForUser(req.ctx.tenantId, req.ctx.currentUser.id);
      res.status(200).json(presets);
    } catch (e) { this.handleError(e, res); }
  }

  create(req: Request, res: Response): void {
    try {
      const { name, filterAst, isShared } = req.body as { name?: string; filterAst?: string; isShared?: boolean };
      const preset = service.create({
        name: name ?? '',
        filterAst: filterAst ?? '',
        isShared: isShared ?? false,
        tenantId: req.ctx.tenantId,
        userId: req.ctx.currentUser.id,
      });
      res.status(201).json(preset);
    } catch (e) { this.handleError(e, res); }
  }

  update(req: Request, res: Response): void {
    try {
      const { id } = req.params as { id: string };
      const dto = req.body as { name?: string; filterAst?: string; isShared?: boolean; version?: number; force?: boolean };
      const updated = service.update(req.ctx.tenantId, req.ctx.currentUser.id, id, dto);
      res.status(200).json(updated);
    } catch (e) { this.handleError(e, res); }
  }

  remove(req: Request, res: Response): void {
    try {
      const { id } = req.params as { id: string };
      service.delete(req.ctx.tenantId, req.ctx.currentUser.id, id);
      res.status(204).send();
    } catch (e) { this.handleError(e, res); }
  }
}

export function createPresetsRouter(): Router {
  const router = Router();
  const ctrl = new PresetController();

  router.use(authMiddleware);

  router.get('/',     (req, res) => ctrl.list(req, res));
  router.post('/',    (req, res) => ctrl.create(req, res));
  router.patch('/:id', (req, res) => ctrl.update(req, res));
  router.delete('/:id', (req, res) => ctrl.remove(req, res));

  return router;
}
