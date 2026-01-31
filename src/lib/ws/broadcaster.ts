/**
 * Minimal bridge between server.ts (which owns the WebSocket server)
 * and library code that needs to push messages to clients.
 *
 * server.ts calls `setBroadcaster()` once after the WSS is ready.
 * TerminalStream (and anything else) calls `broadcastToTask()`.
 */

type SendFn = (taskId: string, event: string, payload: Record<string, unknown>) => void;

let _sendToTask: SendFn | null = null;

export function setBroadcaster(fn: SendFn): void {
  _sendToTask = fn;
}

export function broadcastToTask(
  taskId: string,
  event: string,
  payload: Record<string, unknown>,
): void {
  _sendToTask?.(taskId, event, payload);
}
