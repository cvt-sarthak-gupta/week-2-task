import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { PermissionAuthMiddleware } from './permission.auth';
import { PERMISSION_MESSAGES } from './permission.messages';

function makeReq(capabilities: string[]): Request {
  return { ctx: { capabilities } } as unknown as Request;
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

describe('PermissionAuthMiddleware', () => {
  describe('canManageFlags', () => {
    it('calls next() when manageFeatureFlags capability is present', () => {
      const auth = new PermissionAuthMiddleware();
      const next = vi.fn() as NextFunction;
      auth.canManageFlags(makeReq(['viewPatients', 'manageFeatureFlags']), makeRes().res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('calls next() when manageFeatureFlags is the only capability', () => {
      const auth = new PermissionAuthMiddleware();
      const next = vi.fn() as NextFunction;
      auth.canManageFlags(makeReq(['manageFeatureFlags']), makeRes().res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('does not call next() when manageFeatureFlags is absent', () => {
      const auth = new PermissionAuthMiddleware();
      const next = vi.fn() as NextFunction;
      auth.canManageFlags(makeReq(['viewPatients', 'editPatientStatus']), makeRes().res, next);
      expect(next).not.toHaveBeenCalled();
    });

    it('does not call next() when capabilities array is empty', () => {
      const auth = new PermissionAuthMiddleware();
      const next = vi.fn() as NextFunction;
      auth.canManageFlags(makeReq([]), makeRes().res, next);
      expect(next).not.toHaveBeenCalled();
    });

    it('responds with HTTP 403 when capability is absent', () => {
      const auth = new PermissionAuthMiddleware();
      const { res, capture } = makeRes();
      auth.canManageFlags(makeReq(['viewPatients']), res, vi.fn());
      expect(capture.statusCode).toBe(403);
    });

    it('responds with HTTP 403 when capabilities is empty', () => {
      const auth = new PermissionAuthMiddleware();
      const { res, capture } = makeRes();
      auth.canManageFlags(makeReq([]), res, vi.fn());
      expect(capture.statusCode).toBe(403);
    });

    it('error body contains the FORBIDDEN_FLAGS message', () => {
      const auth = new PermissionAuthMiddleware();
      const { res, capture } = makeRes();
      auth.canManageFlags(makeReq([]), res, vi.fn());
      expect((capture.body as { message?: string })?.message).toBe(PERMISSION_MESSAGES.FORBIDDEN_FLAGS);
    });

    it('does not respond when capability is present (lets next() handle it)', () => {
      const auth = new PermissionAuthMiddleware();
      const { res, capture } = makeRes();
      auth.canManageFlags(makeReq(['manageFeatureFlags']), res, vi.fn());
      expect(capture.statusCode).toBeNull();
    });
  });
});
