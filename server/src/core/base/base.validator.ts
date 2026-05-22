import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { ValidationError } from '../errors/index';

type ValidationSource = 'body' | 'params' | 'query';

export abstract class BaseValidator {
  constructor(private readonly schemas: Record<string, ZodSchema>) {}

  middleware(operation: string, source: ValidationSource = 'body') {
    return (req: Request, res: Response, next: NextFunction): void => {
      const schema = this.schemas[operation];
      if (!schema) {
        res.status(500).json({ status: 'error', message: `No schema registered for operation: ${operation}` });
        return;
      }
      const result = schema.safeParse(req[source]);
      if (!result.success) {
        const err = new ValidationError(result.error.errors.map((e) => e.message).join(', '));
        res.status(err.statusCode).json(err.json());
        return;
      }
      req.validatedData = { ...(req.validatedData ?? {}), ...(result.data as Record<string, unknown>) };
      next();
    };
  }
}
