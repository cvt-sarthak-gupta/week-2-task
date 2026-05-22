import { z } from 'zod';
import { BaseValidator } from '../../core/base/base.validator';

export default class PresetValidator extends BaseValidator {
  constructor() {
    super({
      id: z.object({ id: z.string().min(1) }).strict(),

      create: z.object({
        name: z.string().min(1),
        filterAst: z.string().min(1),
        isShared: z.boolean().optional().default(false),
      }).strict(),

      update: z.object({
        name: z.string().min(1).optional(),
        filterAst: z.string().optional(),
        isShared: z.boolean().optional(),
        version: z.number().int().positive(),
        force: z.boolean().optional().default(false),
      }).strict(),
    });
  }
}
