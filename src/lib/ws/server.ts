import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server as HttpServer } from 'http';
import type { WSMessage } from '@/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WS_PORT = 3101;
const PING_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubscribedClient {
  ws: WebSocket;
  subscribedTasks: Set<string>;
}

// ---------------------------------------------------------------------------
// WSServer Singleton
// ---------------------------------------------------------------------------

let instance: WSServer | null = null;

export class WSServer {
  private wss: WebSocketServer;
  private clients: Map<WebSocket, SubscribedClient> = new Map();
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  private constructor(httpServer?: HttpServer) {
    if (httpServer) {
      this.wss = new WebSocketServer({ server: httpServer });
    } else {
      this.wss = new WebSocketServer({ port: WS_PORT });
    }

    this.wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
      this.handleConnection(ws);
    });

    this.startPingInterval();
  }

  /**
   * Get or create the singleton WSServer instance.
   */
  static getInstance(httpServer?: HttpServer): WSServer {
    if (!instance) {
      instance = new WSServer(httpServer);
    }
    return instance;
  }

  /**
   * Reset the singleton (primarily for testing or shutdown).
   */
  static resetInstance(): void {
    if (instance) {
      instance.shutdown();
      instance = null;
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Broadcast an event to all connected clients.
   */
  broadcast(event: string, payload: Record<string, unknown>): void {
    const message: WSMessage = {
      event,
      payload,
      timestamp: new Date().toISOString(),
    };
    const data = JSON.stringify(message);

    for (const [ws] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  /**
   * Send an event only to clients subscribed to a specific task.
   */
  sendToTask(
    taskId: string,
    event: string,
    payload: Record<string, unknown>,
  ): void {
    const message: WSMessage = {
      event,
      payload,
      timestamp: new Date().toISOString(),
    };
    const data = JSON.stringify(message);

    for (const [ws, client] of this.clients) {
      if (ws.readyState === WebSocket.OPEN && client.subscribedTasks.has(taskId)) {
        ws.send(data);
      }
    }
  }

  /**
   * Return the number of currently connected clients.
   */
  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Gracefully shut down the WebSocket server.
   */
  shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    for (const [ws] of this.clients) {
      ws.close(1001, 'Server shutting down');
    }
    this.clients.clear();

    this.wss.close();
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private handleConnection(ws: WebSocket): void {
    const client: SubscribedClient = {
      ws,
      subscribedTasks: new Set(),
    };
    this.clients.set(ws, client);

    ws.on('message', (raw: Buffer | string) => {
      this.handleMessage(client, raw);
    });

    ws.on('close', () => {
      this.clients.delete(ws);
    });

    ws.on('error', () => {
      this.clients.delete(ws);
    });

    ws.on('pong', () => {
      // Client is alive — nothing extra to do
    });
  }

  private handleMessage(client: SubscribedClient, raw: Buffer | string): void {
    try {
      const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
      const msg = JSON.parse(text) as WSMessage;

      if (msg.event === 'subscribe' && typeof msg.payload.task_id === 'string') {
        client.subscribedTasks.add(msg.payload.task_id);
      }

      if (msg.event === 'unsubscribe' && typeof msg.payload.task_id === 'string') {
        client.subscribedTasks.delete(msg.payload.task_id);
      }
    } catch {
      // Ignore malformed messages
    }
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      for (const [ws] of this.clients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      }
    }, PING_INTERVAL_MS);
  }
}

/**
 * Convenience accessor for the singleton.
 */
export function getWSServer(httpServer?: HttpServer): WSServer {
  return WSServer.getInstance(httpServer);
}
