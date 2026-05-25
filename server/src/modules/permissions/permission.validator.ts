import { z } from 'zod';
import { BaseValidator } from '../../core/base/base.validator';

export default class PermissionValidator extends BaseValidator {
  constructor() {
    super({
      updateFlags: z.object({
        exportFeature:   z.boolean().optional(),
        advancedFilters: z.boolean().optional(),
        presetSharing:   z.boolean().optional(),
      }),
      updateColumns: z.object({
        role: z.string().min(1),
        columns: z.record(z.string(), z.boolean()),
      }),
    });
  }
}
