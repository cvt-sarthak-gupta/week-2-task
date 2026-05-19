import express from 'express';
import cors from 'cors';
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

app.use(cors({ origin: /^http:\/\/localhost:\d+$/, credentials: true }));
app.use(express.json());

// Setup WebSocket
const broadcaster = setupWebSocket(httpServer);

// SSE (shares broadcaster interface)
const sseRouter = createSseRouter();
const combinedBroadcaster = {
  broadcast: (event: Parameters<typeof broadcaster.broadcast>[0]) => {
    broadcaster.broadcast(event);
    sseRouter.broadcastSse(event);
  },
};

// Seed store
const patientStore = new InMemoryStore<PatientEntity>();
seedPatients(patientStore);

// Routes
app.get('/healthz', (_req, res) => { res.status(200).send('ok'); });
app.use('/auth', createAuthRouter());
app.use('/', createPermissionsRouter());
app.use('/patients', createPatientRouter(patientStore, combinedBroadcaster));
app.use('/presets', createPresetsRouter());
app.use('/', sseRouter);

// Periodic vitals broadcaster — simulates live sensor data arriving from medical devices
const VITALS_TENANTS = ['tenant-a', 'tenant-b', 'tenant-c'];
const VITALS_PER_TICK = 15; // patients updated per interval across all tenants

setInterval(() => {
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
        version: 0,   // vitals bypass entity-version ordering on the client
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

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
httpServer.listen(PORT, () => {
  console.log(`Mock server running on http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`SSE: http://localhost:${PORT}/sse`);
});

export { app };
