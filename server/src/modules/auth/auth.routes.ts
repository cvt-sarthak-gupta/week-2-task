import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { JWT_SECRET } from './auth.middleware';

// Passwords are stored as bcrypt hashes — never plaintext.
// Pre-computed from 'password123' with 10 salt rounds.
// In production, replace these hashes with real per-user hashes from a database.
const DEMO_PASSWORD_HASH = '$2b$10$5VJFoUeGPG6sOpeV.xB9hO87ffMXmqMe1lUaQGskDSO1DvikUXpI6';

const DEMO_USERS = [
  {
    id: 'u1', tenantId: 'tenant-a', email: 'coordinator@tenant-a.com',
    passwordHash: DEMO_PASSWORD_HASH, role: 'coordinator',
    capabilities: ['viewPatients', 'editPatientStatus', 'editPatientNotes', 'viewAlerts', 'managePresets', 'sharePresets', 'exportPatients'],
  },
  {
    id: 'u2', tenantId: 'tenant-a', email: 'admin@tenant-a.com',
    passwordHash: DEMO_PASSWORD_HASH, role: 'admin',
    capabilities: ['viewPatients', 'editPatientStatus', 'editPatientNotes', 'viewAlerts', 'managePresets', 'exportPatients', 'viewAnalytics', 'manageUsers', 'viewAuditLog', 'assignCoordinator', 'dischargePatient', 'sharePresets', 'manageFeatureFlags', 'dismissAlerts'],
  },
  {
    id: 'u3', tenantId: 'tenant-a', email: 'readonly@tenant-a.com',
    passwordHash: DEMO_PASSWORD_HASH, role: 'readonly',
    capabilities: ['viewPatients', 'viewAlerts'],
  },
  {
    id: 'u4', tenantId: 'tenant-b', email: 'coordinator@tenant-b.com',
    passwordHash: DEMO_PASSWORD_HASH, role: 'coordinator',
    capabilities: ['viewPatients', 'editPatientStatus', 'editPatientNotes', 'viewAlerts', 'managePresets', 'sharePresets'],
  },
] as const;

// Access token lifetime is kept short (5 min) to limit the exposure window
// if a token is somehow intercepted. The refresh token (httpOnly cookie) handles
// transparent re-authentication.
// `exactOptionalPropertyTypes` requires a non-undefined value for expiresIn.
// The nullish fallback guarantees that, but we must narrow the type explicitly.
function toExpiry(raw: string | undefined, fallback: string): NonNullable<SignOptions['expiresIn']> {
  return (raw ?? fallback) as NonNullable<SignOptions['expiresIn']>;
}
const ACCESS_TOKEN_EXPIRY  = toExpiry(process.env['ACCESS_TOKEN_EXPIRY'],  '5m');
const REFRESH_TOKEN_EXPIRY = toExpiry(process.env['REFRESH_TOKEN_EXPIRY'], '7d');

export function createAuthRouter(): Router {
  const router = Router();

  router.post('/login', async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };

    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ status: 'error', message: 'email and password are required' });
      return;
    }

    const user = DEMO_USERS.find((u) => u.email === email);

    // Constant-time comparison — bcrypt.compare takes the same time even for unknown users,
    // which prevents timing-based user enumeration attacks.
    const passwordMatch = user ? await bcrypt.compare(password, user.passwordHash) : await bcrypt.compare(password, DEMO_PASSWORD_HASH);

    if (!user || !passwordMatch) {
      res.status(401).json({ status: 'error', message: 'Invalid credentials' });
      return;
    }

    const accessToken = jwt.sign(
      { sub: user.id, tenantId: user.tenantId, email: user.email, role: user.role, capabilities: user.capabilities },
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );
    const refreshToken = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 3600 * 1000,
    });
    res.status(200).json({
      accessToken,
      user: { id: user.id, tenantId: user.tenantId, email: user.email, displayName: user.email.split('@')[0], role: user.role },
    });
  });

  router.post('/refresh', (req, res) => {
    const cookieHeader = req.headers.cookie ?? '';
    const refreshToken = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('refresh_token='))
      ?.slice('refresh_token='.length);

    if (!refreshToken) { res.status(401).json({ status: 'error', message: 'No refresh token' }); return; }

    try {
      const payload = jwt.verify(refreshToken, JWT_SECRET) as { sub: string };
      const user = DEMO_USERS.find((u) => u.id === payload.sub);
      if (!user) { res.status(401).json({ status: 'error', message: 'User not found' }); return; }

      const accessToken = jwt.sign(
        { sub: user.id, tenantId: user.tenantId, email: user.email, role: user.role, capabilities: user.capabilities },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRY },
      );
      res.status(200).json({ accessToken });
    } catch {
      res.status(401).json({ status: 'error', message: 'Invalid refresh token' });
    }
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie('refresh_token');
    res.status(204).send();
  });

  return router;
}
