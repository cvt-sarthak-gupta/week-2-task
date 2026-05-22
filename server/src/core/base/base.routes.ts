import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { BaseController } from './base.controller';

type MiddlewareMap = {
  index?: RequestHandler[];
  show?: RequestHandler[];
  create?: RequestHandler[];
  update?: RequestHandler[];
  destroy?: RequestHandler[];
};

export abstract class BaseApiRoutes {
  protected readonly router: Router;
  protected readonly basePath: string;
  private initialized = false;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.router = Router();
  }

  protected abstract initializeRoutes(): void;

  // Custom routes must be registered before calling addRestRoutes to avoid /:id param conflicts.
  protected addRestRoutes(controller: BaseController, middlewares: MiddlewareMap): void {
    if (middlewares.index) {
      this.router.get(
        this.basePath,
        ...middlewares.index,
        (req, res) => void controller.index(req, res),
      );
    }
    if (middlewares.show) {
      this.router.get(
        `${this.basePath}/:id`,
        ...middlewares.show,
        (req, res) => void controller.show(req, res),
      );
    }
    if (middlewares.create) {
      this.router.post(
        this.basePath,
        ...middlewares.create,
        (req, res) => void controller.create(req, res),
      );
    }
    if (middlewares.update) {
      this.router.patch(
        `${this.basePath}/:id`,
        ...middlewares.update,
        (req, res) => void controller.update(req, res),
      );
    }
    if (middlewares.destroy) {
      this.router.delete(
        `${this.basePath}/:id`,
        ...middlewares.destroy,
        (req, res) => void controller.destroy(req, res),
      );
    }
  }

  // Lazy-initialises routes on first access so subclass constructor fields are
  // guaranteed to be set before initializeRoutes() reads them.
  getRouter(): Router {
    if (!this.initialized) {
      this.initialized = true;
      this.initializeRoutes();
    }
    return this.router;
  }
}
