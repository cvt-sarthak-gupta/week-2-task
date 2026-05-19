import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../../core/errors/index';
import type { RequestContext } from '../../core/types/context.types';

export const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-prod';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedError('Missing token');

    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      tenantId: string;
      email: string;
      role: string;
    };

    req.ctx = {
      tenantId: payload.tenantId,
      currentUser: { id: payload.sub, email: payload.email, role: payload.role },
      currentRole: payload.role,
    };
    next();
  } catch {
    const err = new UnauthorizedError();
    res.status(err.statusCode).json(err.json());
  }
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      ctx: RequestContext;
    }
  }
}
