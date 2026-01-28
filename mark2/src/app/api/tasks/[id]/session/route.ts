import { NextResponse } from 'next/server';
import { getDb, schema } from '@/lib/db';
import { eq, and, desc } from 'drizzle-orm';
import { exec } from 'child_process';
import { isSessionAlive } from '@/lib/utils/tmux';

// ---------------------------------------------------------------------------
// GET /api/tasks/[id]/session — Return active tmux session info for a task
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const db = getDb();

    const rows = db
      .select({
        id: schema.agentSessions.id,
        tmux_session: schema.agentSessions.tmux_session,
        agent_name: schema.agentSessions.agent_name,
        phase: schema.agentSessions.phase,
        status: schema.agentSessions.status,
      })
      .from(schema.agentSessions)
      .where(
        and(
          eq(schema.agentSessions.task_id, id),
          eq(schema.agentSessions.status, 'running'),
        ),
      )
      .orderBy(desc(schema.agentSessions.started_at))
      .all();

    // Verify each "running" session is actually alive in tmux,
    // mark dead ones as failed so we don't return stale data
    let session = null;
    for (const row of rows) {
      const alive = await isSessionAlive(row.tmux_session);
      if (alive) {
        session = {
          tmux_session: row.tmux_session,
          agent_name: row.agent_name,
          phase: row.phase,
          status: row.status,
        };
        break;
      } else {
        // Mark stale session as failed
        db.update(schema.agentSessions)
          .set({
            status: 'failed',
            ended_at: new Date().toISOString(),
          })
          .where(eq(schema.agentSessions.id, row.id))
          .run();
      }
    }

    return NextResponse.json({ session });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to get session' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/tasks/[id]/session — Open tmux session in native terminal
// ---------------------------------------------------------------------------

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const db = getDb();

    const rows = db
      .select({ tmux_session: schema.agentSessions.tmux_session })
      .from(schema.agentSessions)
      .where(
        and(
          eq(schema.agentSessions.task_id, id),
          eq(schema.agentSessions.status, 'running'),
        ),
      )
      .orderBy(desc(schema.agentSessions.started_at))
      .limit(1)
      .all();

    const session = rows[0];
    if (!session) {
      return NextResponse.json(
        { error: 'No active tmux session for this task' },
        { status: 404 },
      );
    }

    const tmuxCmd = `tmux attach-session -t ${session.tmux_session}`;
    const platform = process.platform;

    let shellCmd: string;

    if (platform === 'darwin') {
      // macOS: use osascript to open Terminal.app
      shellCmd = `osascript -e 'tell application "Terminal" to do script "${tmuxCmd}"' -e 'tell application "Terminal" to activate'`;
    } else {
      // Linux: try common terminal emulators in order
      shellCmd = `
        if command -v kitty >/dev/null 2>&1; then
          kitty ${tmuxCmd} &
        elif command -v x-terminal-emulator >/dev/null 2>&1; then
          x-terminal-emulator -e ${tmuxCmd} &
        elif command -v gnome-terminal >/dev/null 2>&1; then
          gnome-terminal -- ${tmuxCmd} &
        elif command -v konsole >/dev/null 2>&1; then
          konsole -e ${tmuxCmd} &
        elif command -v xterm >/dev/null 2>&1; then
          xterm -e ${tmuxCmd} &
        else
          echo "NO_TERMINAL_FOUND"
        fi
      `;
    }

    return new Promise<NextResponse>((resolve) => {
      exec(shellCmd, { timeout: 5000 }, (error, stdout) => {
        if (stdout?.trim() === 'NO_TERMINAL_FOUND') {
          resolve(
            NextResponse.json(
              {
                error: 'No supported terminal emulator found',
                manual_command: tmuxCmd,
              },
              { status: 500 },
            ),
          );
          return;
        }
        if (error) {
          resolve(
            NextResponse.json(
              { error: error.message, manual_command: tmuxCmd },
              { status: 500 },
            ),
          );
          return;
        }
        resolve(
          NextResponse.json({
            success: true,
            tmux_session: session.tmux_session,
          }),
        );
      });
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to open terminal' },
      { status: 500 },
    );
  }
}
