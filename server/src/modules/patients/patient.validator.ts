import { z } from 'zod';
import { BaseValidator } from '../../core/base/base.validator';

const STATUS_VALUES = ['critical', 'stable', 'discharged', 'pending', 'admitted'] as const;

export default class PatientValidator extends BaseValidator {
  constructor() {
    super({
      // Query params: unknown keys silently stripped (no .strict()) because the
      // frontend includes tenantId in the QS for its own bookkeeping.
      list: z.object({
        page: z.coerce.number().int().positive().optional().default(1),
        limit: z.coerce.number().int().positive().max(200).optional().default(20),
        since: z.coerce.number().optional(),
        status: z.string().optional(),
        ward: z.string().optional(),
        search: z.string().optional(),
        sort: z.string().optional(),
        filterAst: z.string().optional(),
      }),

      stream: z.object({
        since: z.coerce.number().optional(),
      }),

      export: z.object({
        status: z.string().optional(),
        ward: z.string().optional(),
        search: z.string().optional(),
        sort: z.string().optional(),
        filterAst: z.string().optional(),
      }),

      id: z.object({ id: z.string().min(1) }).strict(),

      update: z.object({
        status: z.enum(STATUS_VALUES).optional(),
        notes: z.string().optional(),
        heartRate: z.number().optional(),
        bp: z.string().optional(),
        temp: z.number().optional(),
        o2sat: z.number().optional(),
        version: z.number().optional(),
      }).strict(),
    });
  }
}
