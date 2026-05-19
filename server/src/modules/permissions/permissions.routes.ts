import { Router } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../auth/auth.middleware';

const DEFAULT_FLAGS = {
  analyticsWidget: false,
  exportFeature: false,
  advancedFilters: false,
  offlineSupport: false,
  presetSharing: true,
};

const FEATURE_FLAGS_BY_TENANT: Record<string, typeof DEFAULT_FLAGS> = {
  'tenant-a': { analyticsWidget: false, exportFeature: true, advancedFilters: true, offlineSupport: true, presetSharing: true },
  'tenant-b': { analyticsWidget: true,  exportFeature: false, advancedFilters: true, offlineSupport: false, presetSharing: true },
  'tenant-c': { analyticsWidget: true,  exportFeature: true,  advancedFilters: true, offlineSupport: true,  presetSharing: true },
};

export function createPermissionsRouter(): Router {
  const router = Router();

  router.get('/me/config', (req, res) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) { res.status(401).json({ status: 'error', message: 'Unauthorized' }); return; }
    try {
      const payload = jwt.verify(header.slice(7), JWT_SECRET) as {
        sub: string; tenantId: string; capabilities: string[];
      };
      const flags = FEATURE_FLAGS_BY_TENANT[payload.tenantId] ?? DEFAULT_FLAGS;
      res.status(200).json({
        version: 'v1',
        config: {
          capabilities: payload.capabilities,
          featureFlags: flags,
          layout: {
            visibleColumns: [
              { field: 'mrn', label: 'MRN', visible: true },
              { field: 'lastName', label: 'Last Name', visible: true },
              { field: 'firstName', label: 'First Name', visible: true },
              { field: 'status', label: 'Status', visible: true },
              { field: 'ward', label: 'Ward', visible: true },
            ],
            sideWidgets: [],
            actionBar: payload.capabilities.includes('editPatientStatus') ? ['editStatus'] : [],
          },
        },
      });
    } catch {
      res.status(401).json({ status: 'error', message: 'Invalid token' });
    }
  });

  return router;
}
