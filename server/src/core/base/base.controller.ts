import type { Response } from 'express';
import { CustomError, UnprocessableEntityError } from '../errors/index';

export abstract class BaseController {
  protected handleError(error: unknown, res: Response): void {
    if (error instanceof CustomError) {
      res.status(error.statusCode).json(error.json());
      return;
    }
    console.error('[BaseController] Unhandled error:', error instanceof Error ? error.stack : error);
    const e = new UnprocessableEntityError((error as Error).message ?? 'Unknown error');
    res.status(e.statusCode).json(e.json());
  }
}
