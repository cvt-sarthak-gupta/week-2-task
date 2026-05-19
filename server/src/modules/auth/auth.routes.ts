import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './auth.middleware';

const DEMO_USERS = [
  { id: 'u1', tenantId: 'tenant-a', email: 'coordinator@tenant-a.com', password: 'password123', role: 'coordinator',
    capabilities: ['viewPatients', 'editPatientStatus', 'editPatientNotes', 'viewAlerts', 'managePresets', 'sharePresets', 'exportPatients'] },
  { id: 'u2', tenantId: 'tenant-a', email: 'admin@tenant-a.com', password: 'password123', role: 'admin',
    capabilities: ['viewPatients', 'editPatientStatus', 'editPatientNotes', 'viewAlerts', 'managePresets', 'exportPatients', 'viewAnalytics', 'manageUsers', 'viewAuditLog', 'assignCoordinator', 'dischargePatient', 'sharePresets', 'manageFeatureFlags', 'dismissAlerts'] },
  { id: 'u3', tenantId: 'tenant-a', email: 'readonly@tenant-a.com', password: 'password123', role: 'readonly',
    capabilities: ['viewPatients', 'viewAlerts'] },
  { id: 'u4', tenantId: 'tenant-b', email: 'coordinator@tenant-b.com', password: 'password123', role: 'coordinator',
    capabilities: ['viewPatients', 'editPatientStatus', 'editPatientNotes', 'viewAlerts', 'managePresets', 'sharePresets'] },
] as const;

export function createAuthRouter(): Router {
  const router = Router();

  router.post('/login', (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    const user = DEMO_USERS.find((u) => u.email === email && u.password === password);

    if (!user) {
      res.status(401).json({ status: 'error', message: 'Invalid credentials' });
      return;
    }

    const accessToken = jwt.sign(
      { sub: user.id, tenantId: user.tenantId, email: user.email, role: user.role, capabilities: user.capabilities },
      JWT_SECRET,
      { expiresIn: '5m' },
    );
    const refreshToken = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('refresh_token', refreshToken, { httpOnly: true, secure: process.env['NODE_ENV'] === 'production', sameSite: 'strict', maxAge: 7 * 24 * 3600 * 1000 });
    res.status(200).json({ accessToken, user: { id: user.id, tenantId: user.tenantId, email: user.email, displayName: user.email.split('@')[0], role: user.role } });
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
        { expiresIn: '5m' },
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
