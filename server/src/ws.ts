import { WebSocketServer, type WebSocket } from 'ws';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './modules/auth/auth.middleware';

export interface ServerEventPayload {
  id: string;
  type: string;
  entityId: string;
  tenantId: string; // required for tenant-scoped broadcast
  version: number;
  ts: number;
  payload: unknown;
}

export interface EventBroadcaster {
  broadcast(event: ServerEventPayload): void;
}

// Augment WebSocket with tenant context set at authentication time
interface AuthenticatedSocket extends WebSocket {
  tenantId?: string;
}

export function setupWebSocket(httpServer: Server): EventBroadcaster {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: AuthenticatedSocket, req) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) { ws.close(1008, 'Missing token'); return; }

    try {
      const payload = jwt.verify(token, JWT_SECRET) as { tenantId?: string };
      if (!payload.tenantId) { ws.close(1008, 'Invalid token payload'); return; }
      ws.tenantId = payload.tenantId;
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
        const sock = client as AuthenticatedSocket;
        // Only send to clients belonging to the same tenant as the event
        if (sock.readyState === 1 && sock.tenantId === event.tenantId) {
          sock.send(payload);
        }
      }
    },
  };
}
