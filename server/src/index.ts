import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { createServer } from 'node:http';
import { setupWebSocket } from './ws';
import { createSseRouter } from './sse';
import { createAuthRouter } from './modules/auth/auth.routes';
import { createPatientRouter } from './modules/patients/patient.routes';
import { createPermissionsRouter } from './modules/permissions/permissions.routes';
import { createPresetsRouter } from './modules/presets/preset.routes';
import { InMemoryStore } from './infrastructure/inMemoryStore';
import type { PatientEntity } from './modules/patients/patient.entity';
import { seedPatients } from './scripts/seed';

const app = express();
const httpServer = createServer(app);

// --- Security headers ---
app.use(helmet());

// --- CORS: explicit allowed origins from env in production ---
const allowedOrigins = process.env['ALLOWED_ORIGINS']
  ? process.env['ALLOWED_ORIGINS'].split(',').map((o) => o.trim())
  : null;
app.use(cors({
  origin: allowedOrigins ?? /^http:\/\/localhost:\d+$/,
  credentials: true,
}));

// --- Request logging ---
app.use(morgan('combined'));

// --- Body size limit (prevents large-payload DoS) ---
app.use(express.json({ limit: '10kb' }));

// --- Rate limiting on auth endpoints ---
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many requests, please try again later.' },
});

// --- Setup WebSocket ---
const broadcaster = setupWebSocket(httpServer);

// --- SSE (shares broadcaster interface) ---
const sseRouter = createSseRouter();
const combinedBroadcaster = {
  broadcast: (event: Parameters<typeof broadcaster.broadcast>[0]) => {
    broadcaster.broadcast(event);
    sseRouter.broadcastSse(event);
  },
};

// --- Seed store ---
const patientStore = new InMemoryStore<PatientEntity>();
seedPatients(patientStore);

// --- Routes ---
app.get('/healthz', (_req, res) => { res.status(200).json({ status: 'ok', ts: Date.now() }); });
app.use('/auth', authLimiter, createAuthRouter());
app.use('/', createPermissionsRouter());
app.use('/patients', createPatientRouter(patientStore, combinedBroadcaster));
app.use('/presets', createPresetsRouter());
app.use('/', sseRouter);

// --- Periodic vitals broadcaster — simulates live sensor data ---
const VITALS_TENANTS = ['tenant-a', 'tenant-b', 'tenant-c'];
const VITALS_PER_TICK = 15;

const vitalsInterval = setInterval(() => {
  const now = Date.now();
  for (const tenantId of VITALS_TENANTS) {
    const count = patientStore.count(tenantId);
    if (count === 0) continue;
    for (let i = 0; i < VITALS_PER_TICK; i++) {
      const idx = Math.floor(Math.random() * count) + 1;
      const entityId = `${tenantId}-p-${String(idx).padStart(6, '0')}`;
      const patient = patientStore.get(tenantId, entityId);
      if (!patient) continue;
      const critical = patient.status === 'critical';
      combinedBroadcaster.broadcast({
        id: `vitals-${now}-${tenantId}-${idx}`,
        type: 'vitals_updated',
        entityId,
        tenantId, // required for tenant-scoped broadcast
        version: 0,
        ts: now,
        payload: {
          heartRate: critical ? (40 + Math.floor(Math.random() * 80)) : (58 + Math.floor(Math.random() * 44)),
          bp: `${critical ? (80 + Math.floor(Math.random() * 70)) : (100 + Math.floor(Math.random() * 60))}/${critical ? (40 + Math.floor(Math.random() * 40)) : (60 + Math.floor(Math.random() * 30))}`,
          temp: parseFloat((critical ? (36.0 + Math.random() * 2.9) : (36.0 + Math.random() * 1.9)).toFixed(1)),
          o2sat: critical ? (82 + Math.floor(Math.random() * 14)) : (95 + Math.floor(Math.random() * 6)),
        },
      });
    }
  }
}, 1000);

// --- Graceful shutdown ---
function shutdown(): void {
  console.log('\nGraceful shutdown: draining connections…');
  clearInterval(vitalsInterval);
  httpServer.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
  // Force-exit after 10 s if connections don't drain
  setTimeout(() => process.exit(1), 10_000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
httpServer.listen(PORT, () => {
  console.log(`Mock server running on http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`SSE: http://localhost:${PORT}/sse`);
});

export { app };
