import { Router } from 'express';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './modules/auth/auth.middleware';
import type { ServerEventPayload, EventBroadcaster } from './ws';

type SseClient = { res: Response; tenantId: string };

// Module-scoped Set is intentional — one SSE fan-out list per server process.
// Cleanup on 'close' prevents unbounded growth.
const clients = new Set<SseClient>();

export function createSseRouter(): Router & { broadcastSse: EventBroadcaster['broadcast'] } {
  const router = Router() as Router & { broadcastSse: EventBroadcaster['broadcast'] };

  router.get('/sse', (req: Request, res: Response) => {
    const token = String(req.query['token'] ?? '');
    if (!token) {
      res.status(401).json({ status: 'error', message: 'Missing token' });
      return;
    }

    let tenantId: string;
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { tenantId?: string };
      if (!payload.tenantId) { res.status(401).json({ status: 'error', message: 'Invalid token payload' }); return; }
      tenantId = payload.tenantId;
    } catch {
      res.status(401).json({ status: 'error', message: 'Invalid token' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(': connected\n\n');

    // tenantId comes exclusively from the verified JWT — not from query params
    const client: SseClient = { res, tenantId };
    clients.add(client);

    req.on('close', () => { clients.delete(client); });
  });

  router.broadcastSse = (event: ServerEventPayload) => {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of clients) {
      // Only push to clients whose tenant matches the event
      if (client.tenantId === event.tenantId) {
        client.res.write(data);
      }
    }
  };

  return router;
}
