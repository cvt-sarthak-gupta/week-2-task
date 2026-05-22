import type { Router } from 'express';
import { BaseApiRoutes } from '../../core/base/base.routes';
import { PatientController } from './patient.controller';
import { PatientService } from './patient.service';
import { PatientRepository } from './patient.repository';
import { PatientAuthMiddleware } from './patient.auth';
import PatientValidator from './patient.validator';
import { authMiddleware } from '../auth/auth.middleware';
import type { InMemoryStore } from '../../infrastructure/inMemoryStore';
import type { PatientEntity } from './patient.entity';
import type { EventBroadcaster } from '../../ws';

export class PatientRoutes extends BaseApiRoutes {
  private readonly validator = new PatientValidator();
  private readonly auth = new PatientAuthMiddleware();
  private readonly store: InMemoryStore<PatientEntity>;
  private readonly broadcaster: EventBroadcaster;

  constructor(store: InMemoryStore<PatientEntity>, broadcaster: EventBroadcaster) {
    super('/patients');
    this.store = store;
    this.broadcaster = broadcaster;
  }

  protected initializeRoutes(): void {
    const { validator, auth } = this;

    // Custom routes before /:id to avoid param conflicts.
    this.router.get(
      `${this.basePath}/stream`,
      authMiddleware,
      validator.middleware('stream', 'query'),
      (req, res) => { void this.makeController(req.ctx.tenantId).stream(req, res); },
    );

    this.router.get(
      `${this.basePath}/export`,
      authMiddleware,
      validator.middleware('export', 'query'),
      (req, res) => { void this.makeController(req.ctx.tenantId).export(req, res); },
    );

    this.router.get(
      this.basePath,
      authMiddleware,
      validator.middleware('list', 'query'),
      (req, res) => { void this.makeController(req.ctx.tenantId).index(req, res); },
    );

    this.router.get(
      `${this.basePath}/:id`,
      authMiddleware,
      validator.middleware('id', 'params'),
      (req, res) => { void this.makeController(req.ctx.tenantId).show(req, res); },
    );

    this.router.patch(
      `${this.basePath}/:id`,
      authMiddleware,
      validator.middleware('id', 'params'),
      validator.middleware('update', 'body'),
      auth.canEdit.bind(auth),
      (req, res) => { void this.makeController(req.ctx.tenantId).update(req, res); },
    );
  }

  // Per-request factory: each request gets a controller scoped to its tenant.
  private makeController(tenantId: string): PatientController {
    const repo = new PatientRepository(this.store, tenantId);
    return new PatientController(new PatientService(repo), this.broadcaster);
  }
}

export function createPatientRouter(store: InMemoryStore<PatientEntity>, broadcaster: EventBroadcaster): Router {
  return new PatientRoutes(store, broadcaster).getRouter();
}
