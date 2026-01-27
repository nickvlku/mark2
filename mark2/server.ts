import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3100', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

interface SubscribedClient extends WebSocket {
  subscribedTasks?: Set<string>;
  isAlive?: boolean;
}

// ── Global broadcast function ───────────────────────────────────────────────

let wss: WebSocketServer | null = null;

export function broadcast(event: string, payload: Record<string, unknown>): void {
  if (!wss) return;
  const message = JSON.stringify({
    event,
    payload,
    timestamp: new Date().toISOString(),
  });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

export function sendToTask(taskId: string, event: string, payload: Record<string, unknown>): void {
  if (!wss) return;
  const message = JSON.stringify({
    event,
    payload,
    timestamp: new Date().toISOString(),
  });
  for (const client of wss.clients) {
    const sub = client as SubscribedClient;
    if (sub.readyState === WebSocket.OPEN && sub.subscribedTasks?.has(taskId)) {
      sub.send(message);
    }
  }
}

// ── Server startup ──────────────────────────────────────────────────────────

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // WebSocket server on same HTTP server (upgrade path)
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const { pathname } = parse(request.url!, true);

    if (pathname === '/ws') {
      wss!.handleUpgrade(request, socket, head, (ws) => {
        wss!.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: SubscribedClient) => {
    ws.subscribedTasks = new Set();
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'subscribe' && msg.payload?.task_id) {
          ws.subscribedTasks!.add(msg.payload.task_id);
        } else if (msg.event === 'unsubscribe' && msg.payload?.task_id) {
          ws.subscribedTasks!.delete(msg.payload.task_id);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      ws.subscribedTasks = undefined;
    });
  });

  // Ping/pong keepalive every 30s
  const pingInterval = setInterval(() => {
    if (!wss) return;
    for (const client of wss.clients) {
      const sub = client as SubscribedClient;
      if (sub.isAlive === false) {
        sub.terminate();
        continue;
      }
      sub.isAlive = false;
      sub.ping();
    }
  }, 30000);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  server.listen(port, () => {
    console.log(`> Mark2 server ready on http://${hostname}:${port}`);
    console.log(`> WebSocket available at ws://${hostname}:${port}/ws`);
  });
});
