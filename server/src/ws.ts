import { WebSocketServer } from 'ws';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './modules/auth/auth.middleware';

export interface ServerEventPayload {
  id: string;
  type: string;
  entityId: string;
  version: number;
  ts: number;
  payload: unknown;
}

export interface EventBroadcaster {
  broadcast(event: ServerEventPayload): void;
}

export function setupWebSocket(httpServer: Server): EventBroadcaster {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) { ws.close(1008, 'Missing token'); return; }

    try {
      jwt.verify(token, JWT_SECRET);
    } catch {
      ws.close(1008, 'Invalid token');
      return;
    }

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type?: string };
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
      } catch {
        // ignore malformed messages
      }
    });
  });

  return {
    broadcast(event: ServerEventPayload) {
      const payload = JSON.stringify(event);
      for (const client of wss.clients) {
        if (client.readyState === 1) client.send(payload);
      }
    },
  };
}
