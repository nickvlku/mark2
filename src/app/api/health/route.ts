import { NextResponse } from 'next/server';
import { TmuxManager } from '@/lib/orchestration/tmux-manager';
import { getMark2Dir } from '@/lib/utils/mark2-dir';

const startTime = Date.now();

export async function GET() {
  try {
    const mark2Dir = getMark2Dir();
    const tmuxManager = new TmuxManager(mark2Dir);
    const activeSessions = await tmuxManager.getActiveSessions();

    return NextResponse.json({
      status: 'ok',
      version: '0.1.0',
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
      active_agents: activeSessions.length,
      active_bakeoffs: 0,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Health check failed';
    return NextResponse.json(
      { status: 'error', error: message },
      { status: 500 },
    );
  }
}
