import { Router } from 'express';
import { authMiddleware } from '../auth/auth.middleware';

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

  router.get('/me/config', authMiddleware, (req, res) => {
    const { tenantId, currentUser } = req.ctx;

    const capabilities = (req.headers.authorization
      ? (() => {
          try {
            const token = req.headers.authorization.slice(7);
            const parts = token.split('.');
            if (parts.length !== 3 || !parts[1]) return [];
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString()) as { capabilities?: string[] };
            return payload.capabilities ?? [];
          } catch {
            return [];
          }
        })()
      : []) as string[];

    const flags = FEATURE_FLAGS_BY_TENANT[tenantId] ?? DEFAULT_FLAGS;

    res.status(200).json({
      version: 'v1',
      config: {
        capabilities,
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
          actionBar: capabilities.includes('editPatientStatus') ? ['editStatus'] : [],
        },
        userId: currentUser.id,
      },
    });
  });

  return router;
}
