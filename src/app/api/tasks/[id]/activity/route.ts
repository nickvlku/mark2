import { NextResponse } from 'next/server';
import { createActivityService } from '@/lib/services/factory';
import { getDb, schema } from '@/lib/db';
import { eq, and, desc } from 'drizzle-orm';
import { sendCommand, isSessionAlive } from '@/lib/utils/tmux';
import { isValidTaskId } from '@/lib/utils/route-validation';

const service = createActivityService();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidTaskId(id)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    const entries = service.getForTask(
      id,
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined,
    );

    return NextResponse.json({ task_id: id, entries });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to get activity' },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidTaskId(id)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }
    const body = await request.json();

    if (!body.source || !body.type || !body.message) {
      return NextResponse.json(
        { error: 'source, type, and message are required' },
        { status: 400 },
      );
    }

    const entry = service.log(
      id,
      body.source,
      body.type,
      body.message,
      body.metadata,
    );

    // If this is a human comment, forward it to the active tmux session
    if (body.source === 'human' && body.type === 'comment') {
      forwardCommentToSession(id, body.message).catch((err) => {
        console.error(`[activity] Failed to forward comment to tmux:`, err.message);
      });
    }

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError' || error.issues) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues ?? error.message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error.message ?? 'Failed to log activity' },
      { status: 500 },
    );
  }
}

/**
 * Find the active tmux session for a task and send the comment as input.
 * Updated for roles system - no database tracking, just check tmux sessions.
 */
async function forwardCommentToSession(taskId: string, message: string): Promise<void> {
  // Find tmux sessions for this task (simplified without database tracking)
  const { listMark2Sessions } = await import('@/lib/utils/tmux');
  const allSessions = await listMark2Sessions();

  // Look for sessions that include this task ID
  const taskSessions = allSessions.filter(session => session.includes(taskId));

  if (taskSessions.length === 0) return;

  // Try to find the most recent active session (just use the first one found)
  for (const sessionName of taskSessions) {
    const alive = await isSessionAlive(sessionName);
    if (alive) {
      // Send the comment as typed input to the tmux session
      const prefixed = `[Human Comment] ${message}`;
      await sendCommand(sessionName, prefixed);
      return; // Only send to first active session found
    }
  }
}
