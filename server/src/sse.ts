import { Router } from 'express';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './modules/auth/auth.middleware';
import type { ServerEventPayload, EventBroadcaster } from './ws';

type SseClient = { res: Response; tenantId: string };
const clients = new Set<SseClient>();

export function createSseRouter(): Router & { broadcastSse: EventBroadcaster['broadcast'] } {
  const router = Router() as Router & { broadcastSse: EventBroadcaster['broadcast'] };

  router.get('/sse', (req: Request, res: Response) => {
    const token = String(req.query['token'] ?? '');
    if (!token) {
      res.status(401).json({ status: 'error', message: 'Missing token' });
      return;
    }
    try {
      jwt.verify(token, JWT_SECRET);
    } catch {
      res.status(401).json({ status: 'error', message: 'Invalid token' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send initial keep-alive comment
    res.write(': connected\n\n');

    const client: SseClient = { res, tenantId: String(req.query['tenantId'] ?? '') };
    clients.add(client);

    req.on('close', () => { clients.delete(client); });
  });

  router.broadcastSse = (event: ServerEventPayload) => {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of clients) {
      client.res.write(data);
    }
  };

  return router;
}
