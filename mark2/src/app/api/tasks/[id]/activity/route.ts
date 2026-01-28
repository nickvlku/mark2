import { NextResponse } from 'next/server';
import { ActivityService } from '@/lib/services/activity-service';
import { getDb, schema } from '@/lib/db';
import { eq, and, desc } from 'drizzle-orm';
import { sendCommand, isSessionAlive } from '@/lib/utils/tmux';

const service = new ActivityService();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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
 */
async function forwardCommentToSession(taskId: string, message: string): Promise<void> {
  const db = getDb();
  const rows = db
    .select({ tmux_session: schema.agentSessions.tmux_session })
    .from(schema.agentSessions)
    .where(
      and(
        eq(schema.agentSessions.task_id, taskId),
        eq(schema.agentSessions.status, 'running'),
      ),
    )
    .orderBy(desc(schema.agentSessions.started_at))
    .limit(1)
    .all();

  const session = rows[0];
  if (!session) return;

  const alive = await isSessionAlive(session.tmux_session);
  if (!alive) return;

  // Send the comment as typed input to the tmux session
  const prefixed = `[Human Comment] ${message}`;
  await sendCommand(session.tmux_session, prefixed);
}
