import type { Request, Response, NextFunction } from 'express';

export class PatientAuthMiddleware {
  // Tenant isolation is enforced upstream by authMiddleware (JWT → req.ctx.tenantId).
  // PatientService.update() enforces not-found and optimistic-lock conflicts.
  // No per-record ownership applies to patient data.
  canEdit(req: Request, res: Response, next: NextFunction): void {
    void req;
    void res;
    next();
  }
}
