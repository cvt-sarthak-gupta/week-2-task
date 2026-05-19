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

  const getRepo = (tenantId: string) => new PatientRepository(store, tenantId);
  const getService = (tenantId: string) => new PatientService(getRepo(tenantId));

  const ctrl = {
    index: async (req: Request, res: Response) => {
      const tenantId = String(req.query['tenantId'] ?? (req as Request & { ctx?: { tenantId: string } }).ctx?.tenantId ?? '');
      const service = getService(tenantId);
      const controller = new PatientController(service, broadcaster);
      await controller.index(req, res);
    },
    show: async (req: Request, res: Response) => {
      const tenantId = (req as Request & { ctx?: { tenantId: string } }).ctx?.tenantId ?? '';
      const service = getService(tenantId);
      const controller = new PatientController(service, broadcaster);
      await controller.show(req, res);
    },
    patch: async (req: Request, res: Response) => {
      const tenantId = (req as Request & { ctx?: { tenantId: string } }).ctx?.tenantId ?? '';
      const service = getService(tenantId);
      const controller = new PatientController(service, broadcaster);
      await controller.patch(req, res);
    },
  };

  router.get('/', ctrl.index);
  router.get('/:id', authMiddleware, ctrl.show);
  router.patch('/:id', authMiddleware, ctrl.patch);

  return router;
}
