import { Router, type Request, type Response } from 'express';
import { PatientController } from './patient.controller';
import { PatientService } from './patient.service';
import { PatientRepository } from './patient.repository';
import type { InMemoryStore } from '../../infrastructure/inMemoryStore';
import type { PatientEntity } from './patient.entity';
import type { EventBroadcaster } from '../../ws';
import { authMiddleware } from '../auth/auth.middleware';

export function createPatientRouter(store: InMemoryStore<PatientEntity>, broadcaster: EventBroadcaster): Router {
  const router = Router();

  router.use(authMiddleware);

  const getController = (tenantId: string) => {
    const repo = new PatientRepository(store, tenantId);
    const service = new PatientService(repo);
    return new PatientController(service, broadcaster);
  };

  router.get('/stream', (req: Request, res: Response) => {
    void getController(req.ctx.tenantId).stream(req, res);
  });

  router.get('/export', (req: Request, res: Response) => {
    void getController(req.ctx.tenantId).export(req, res);
  });

  router.get('/', (req: Request, res: Response) => {
    void getController(req.ctx.tenantId).index(req, res);
  });

  router.get('/:id', (req: Request, res: Response) => {
    void getController(req.ctx.tenantId).show(req, res);
  });

  router.patch('/:id', (req: Request, res: Response) => {
    void getController(req.ctx.tenantId).patch(req, res);
  });

  return router;
}
