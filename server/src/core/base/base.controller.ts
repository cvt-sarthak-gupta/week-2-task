import type { Request, Response } from 'express';
import { CustomError, UnprocessableEntityError } from '../errors/index';

export abstract class BaseController {
  index(_req: Request, _res: Response): void | Promise<void> {
    void _req;
    void _res;
  }
  show(_req: Request, _res: Response): void | Promise<void> {
    void _req;
    void _res;
  }
  create(_req: Request, _res: Response): void | Promise<void> {
    void _req;
    void _res;
  }
  update(_req: Request, _res: Response): void | Promise<void> {
    void _req;
    void _res;
  }
  destroy(_req: Request, _res: Response): void | Promise<void> {
    void _req;
    void _res;
  }

  protected handleError(error: unknown, res: Response): void {
    if (error instanceof CustomError) {
      res.status(error.statusCode).json(error.json());
      return;
    }
    console.error('[BaseController] Unhandled error:', error instanceof Error ? error.stack : error);
    const e = new UnprocessableEntityError('An unexpected error occurred');
    res.status(e.statusCode).json(e.json());
  }
}
