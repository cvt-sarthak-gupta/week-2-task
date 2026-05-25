import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import PermissionController from './permission.controller';
import type { PermissionService } from './permission.service';
import type { PermissionConfig } from './permission.entity';
import type { FeatureFlags } from '../../infrastructure/featureFlagStore';

const DEFAULTS: FeatureFlags = {
  exportFeature: false,
  advancedFilters: false,
  presetSharing: true,
};

function makeConfig(overrides: Partial<PermissionConfig> = {}): PermissionConfig {
  return {
    capabilities: ['viewPatients', 'editPatientStatus'],
    featureFlags: { ...DEFAULTS },
    layout: {
      visibleColumns: [{ field: 'mrn', label: 'MRN', visible: true }],
      sideWidgets: [],
      actionBar: ['editStatus'],
    },
    userId: 'u1',
    ...overrides,
  };
}

function makeReq(
  ctx: Partial<Request['ctx']> = {},
  validatedData: Record<string, unknown> = {},
): Request {
  return {
    ctx: {
      tenantId: 'tenant-a',
      currentUser: { id: 'u1', email: 'test@example.com', role: 'coordinator' },
      currentRole: 'coordinator',
      capabilities: ['viewPatients'],
      ...ctx,
    },
    validatedData,
  } as unknown as Request;
}

interface ResCapture {
  statusCode: number | null;
  body: unknown;
}

function makeRes(): { res: Response; capture: ResCapture } {
  const capture: ResCapture = { statusCode: null, body: undefined };
  const res = {
    status(code: number) { capture.statusCode = code; return res; },
    json(data: unknown) { capture.body = data; return res; },
  } as unknown as Response;
  return { res, capture };
}

function makeService(overrides: Partial<PermissionService> = {}): PermissionService {
  return {
    getConfig: vi.fn().mockReturnValue(makeConfig()),
    updateFlags: vi.fn().mockReturnValue({ ...DEFAULTS }),
    ...overrides,
  } as unknown as PermissionService;
}

describe('PermissionController', () => {
  describe('show — GET /me/config', () => {
    it('responds with HTTP 200', async () => {
      const controller = new PermissionController(makeService());
      const { res, capture } = makeRes();
      await controller.show(makeReq(), res);
      expect(capture.statusCode).toBe(200);
    });

    it('response body has version "v1"', async () => {
      const controller = new PermissionController(makeService());
      const { res, capture } = makeRes();
      await controller.show(makeReq(), res);
      expect((capture.body as { version?: string })?.version).toBe('v1');
    });

    it('response body includes config', async () => {
      const config = makeConfig();
      const controller = new PermissionController(makeService({ getConfig: vi.fn().mockReturnValue(config) }));
      const { res, capture } = makeRes();
      await controller.show(makeReq(), res);
      expect((capture.body as { config?: PermissionConfig })?.config).toBe(config);
    });

    it('calls service.getConfig with tenantId, userId, and capabilities from ctx', async () => {
      const service = makeService();
      const controller = new PermissionController(service);
      const req = makeReq({
        tenantId: 'tenant-b',
        currentUser: { id: 'u9', email: 'a@b.com', role: 'admin' },
        currentRole: 'admin',
        capabilities: ['viewPatients', 'manageFeatureFlags'],
      });
      const { res } = makeRes();
      await controller.show(req, res);
      expect(service.getConfig).toHaveBeenCalledWith('tenant-b', 'u9', 'admin', ['viewPatients', 'manageFeatureFlags']);
    });

    it('config includes capabilities from service response', async () => {
      const config = makeConfig({ capabilities: ['viewPatients', 'manageFeatureFlags'] });
      const controller = new PermissionController(makeService({ getConfig: vi.fn().mockReturnValue(config) }));
      const { res, capture } = makeRes();
      await controller.show(makeReq(), res);
      expect((capture.body as { config?: PermissionConfig })?.config?.capabilities).toContain('manageFeatureFlags');
    });
  });

  describe('update — PATCH /admin/feature-flags', () => {
    it('responds with HTTP 200', async () => {
      const controller = new PermissionController(makeService());
      const { res, capture } = makeRes();
      await controller.update(makeReq({}, { exportFeature: true }), res);
      expect(capture.statusCode).toBe(200);
    });

    it('response body contains featureFlags returned by service', async () => {
      const updatedFlags: FeatureFlags = { ...DEFAULTS, exportFeature: true };
      const service = makeService({ updateFlags: vi.fn().mockReturnValue(updatedFlags) });
      const controller = new PermissionController(service);
      const { res, capture } = makeRes();
      await controller.update(makeReq({}, { exportFeature: true }), res);
      expect((capture.body as { featureFlags?: FeatureFlags })?.featureFlags).toBe(updatedFlags);
    });

    it('calls service.updateFlags with tenantId from ctx', async () => {
      const service = makeService();
      const controller = new PermissionController(service);
      await controller.update(makeReq({ tenantId: 'tenant-c' }, { exportFeature: true }), makeRes().res);
      expect(service.updateFlags).toHaveBeenCalledWith('tenant-c', { exportFeature: true });
    });

    it('passes the full validated data object to service.updateFlags', async () => {
      const service = makeService();
      const controller = new PermissionController(service);
      const dto = { exportFeature: true, presetSharing: false };
      await controller.update(makeReq({}, dto), makeRes().res);
      expect(service.updateFlags).toHaveBeenCalledWith('tenant-a', dto);
    });

    it('returned featureFlags contains all three flag keys', async () => {
      const controller = new PermissionController(makeService());
      const { res, capture } = makeRes();
      await controller.update(makeReq({}, {}), res);
      const flags = (capture.body as { featureFlags?: FeatureFlags })?.featureFlags;
      expect(flags).toHaveProperty('exportFeature');
      expect(flags).toHaveProperty('advancedFilters');
      expect(flags).toHaveProperty('presetSharing');
    });
  });
});
