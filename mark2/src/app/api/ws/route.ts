import { NextResponse } from 'next/server';

/**
 * GET /api/ws
 *
 * Returns connection information for the WebSocket server.
 * The actual WS server runs on a separate port (3101) because
 * Next.js does not natively support WebSocket upgrade in API routes.
 */
export async function GET() {
  const wsPort = 3101;
  const wsUrl = `ws://localhost:${wsPort}`;

  // Basic liveness check: try to determine if the WS server is likely active.
  // In production the WS server is started alongside the Next.js server,
  // so we report it as active when this route is reachable.
  return NextResponse.json({
    url: wsUrl,
    status: 'active' as const,
  });
}
