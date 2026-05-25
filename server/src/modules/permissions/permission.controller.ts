import type { Request, Response } from 'express';
import { BaseController } from '../../core/base/base.controller';
import type { PermissionService } from './permission.service';
import type {
  UpdateFeatureFlagsDto,
  UpdateColumnVisibilityDto,
  GetConfigResponse,
  UpdateFeatureFlagsResponse,
  UpdateColumnVisibilityResponse,
} from './permission.types';

export default class PermissionController extends BaseController {
  constructor(private readonly service: PermissionService) {
    super();
  }

  // GET /me/config
  override async show(req: Request, res: Response): Promise<void> {
    try {
      const { tenantId, currentUser, currentRole, capabilities } = req.ctx;
      const config = this.service.getConfig(tenantId, currentUser.id, currentRole, capabilities);
      const body: GetConfigResponse = { version: 'v1', config };
      res.status(200).json(body);
    } catch (e) { this.handleError(e, res); }
  }

  // PATCH /admin/feature-flags
  override async update(req: Request, res: Response): Promise<void> {
    try {
      const { tenantId } = req.ctx;
      const dto = req.validatedData as UpdateFeatureFlagsDto;
      const featureFlags = this.service.updateFlags(tenantId, dto);
      const body: UpdateFeatureFlagsResponse = { featureFlags };
      res.status(200).json(body);
    } catch (e) { this.handleError(e, res); }
  }

  // PATCH /admin/layout/columns
  async updateColumns(req: Request, res: Response): Promise<void> {
    try {
      const { tenantId } = req.ctx;
      const dto = req.validatedData as unknown as UpdateColumnVisibilityDto;
      const visibleColumns = this.service.updateColumns(tenantId, dto);
      const body: UpdateColumnVisibilityResponse = { visibleColumns };
      res.status(200).json(body);
    } catch (e) { this.handleError(e, res); }
  }
}
