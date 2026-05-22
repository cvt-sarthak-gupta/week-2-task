import type { Request, Response } from 'express';
import { BaseController } from '../../core/base/base.controller';
import type { PresetService } from './preset.service';
import type { CreatePresetInput, UpdatePresetInput } from './preset.types';

export default class PresetController extends BaseController {
  constructor(private readonly service: PresetService) {
    super();
  }

  override index(req: Request, res: Response): void {
    try {
      const presets = this.service.listForUser(req.ctx.tenantId, req.ctx.currentUser.id);
      res.status(200).json(presets);
    } catch (e) { this.handleError(e, res); }
  }

  override create(req: Request, res: Response): void {
    try {
      const { name, filterAst, isShared } = req.validatedData as unknown as CreatePresetInput;
      const preset = this.service.create({
        name,
        filterAst,
        isShared,
        tenantId: req.ctx.tenantId,
        userId: req.ctx.currentUser.id,
      });
      res.status(201).json(preset);
    } catch (e) { this.handleError(e, res); }
  }

  override update(req: Request, res: Response): void {
    try {
      const { id, version, name, filterAst, isShared, force } =
        req.validatedData as unknown as { id: string } & UpdatePresetInput;

      const dto: UpdatePresetInput = { version };
      if (name      !== undefined) dto.name      = name;
      if (filterAst !== undefined) dto.filterAst = filterAst;
      if (isShared  !== undefined) dto.isShared  = isShared;
      if (force     !== undefined) dto.force     = force;

      const updated = this.service.update(req.ctx.tenantId, req.ctx.currentUser.id, id, dto);
      res.status(200).json(updated);
    } catch (e) { this.handleError(e, res); }
  }

  override destroy(req: Request, res: Response): void {
    try {
      const { id } = req.validatedData as unknown as { id: string };
      this.service.delete(req.ctx.tenantId, req.ctx.currentUser.id, id);
      res.status(204).send();
    } catch (e) { this.handleError(e, res); }
  }
}
