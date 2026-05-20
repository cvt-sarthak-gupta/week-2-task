import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../../core/errors/index';
import type { RequestContext } from '../../core/types/context.types';

// Fail fast at startup if the secret is not configured in production.
// Falling back to a known string would allow anyone to forge tokens.
const rawSecret = process.env['JWT_SECRET'];
if (!rawSecret && process.env['NODE_ENV'] === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production');
}
export const JWT_SECRET: string = rawSecret ?? 'dev-secret-change-in-prod';

interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  role: string;
  capabilities?: string[];
}

function isValidPayload(p: unknown): p is JwtPayload {
  if (!p || typeof p !== 'object') return false;
  const obj = p as Record<string, unknown>;
  return (
    typeof obj['sub'] === 'string' &&
    typeof obj['tenantId'] === 'string' &&
    typeof obj['email'] === 'string' &&
    typeof obj['role'] === 'string'
  );
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedError('Missing token');

    const token = header.slice(7);
    const raw = jwt.verify(token, JWT_SECRET);

    if (!isValidPayload(raw)) throw new UnauthorizedError('Malformed token payload');

    req.ctx = {
      tenantId: raw.tenantId,
      currentUser: { id: raw.sub, email: raw.email, role: raw.role },
      currentRole: raw.role,
    };
    next();
  } catch (err) {
    const e = new UnauthorizedError(err instanceof Error ? err.message : undefined);
    res.status(e.statusCode).json(e.json());
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
