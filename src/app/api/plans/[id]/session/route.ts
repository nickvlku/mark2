import { NextResponse } from 'next/server';
import { getDb, schema } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { exec } from 'child_process';
import { isSessionAlive, capturePane } from '@/lib/utils/tmux';
import { TerminalStream } from '@/lib/ws/terminal-stream';
import { getMark2Dir } from '@/lib/utils/mark2-dir';
import { isValidPlanId } from '@/lib/utils/route-validation';

// ---------------------------------------------------------------------------
// GET /api/plans/[id]/session — Return active tmux session info for a plan
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidPlanId(id)) {
      return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
    }

    const mark2Dir = getMark2Dir();
    const db = getDb(mark2Dir);
    const latestSession = db
      .select()
      .from(schema.agentSessions)
      .where(eq(schema.agentSessions.task_id, id))
      .orderBy(desc(schema.agentSessions.started_at))
      .limit(1)
      .get();

    if (!latestSession) {
      return NextResponse.json({ session: null });
    }

    const alive = await isSessionAlive(latestSession.tmux_session);

    const session = {
      tmux_session: latestSession.tmux_session,
      agent_name: latestSession.agent_name,
      phase: latestSession.phase,
      status: alive ? 'running' : latestSession.status,
    };

    return NextResponse.json({ session });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to get session' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/plans/[id]/session — Open tmux session in native terminal
// ---------------------------------------------------------------------------

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidPlanId(id)) {
      return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
    }

    const mark2Dir = getMark2Dir();
    const db = getDb(mark2Dir);
    const latestSession = db
      .select()
      .from(schema.agentSessions)
      .where(eq(schema.agentSessions.task_id, id))
      .orderBy(desc(schema.agentSessions.started_at))
      .limit(1)
      .get();

    if (!latestSession) {
      return NextResponse.json(
        { error: 'No session found for this plan' },
        { status: 404 },
      );
    }

    const sessionName = latestSession.tmux_session;
    const alive = await isSessionAlive(sessionName);

    if (!alive) {
      return NextResponse.json(
        { error: 'No active tmux session for this plan' },
        { status: 404 },
      );
    }

    const tmuxCmd = `tmux attach-session -t ${sessionName}`;
    const platform = process.platform;

    let shellCmd: string;

    if (platform === 'darwin') {
      shellCmd = `osascript -e 'tell application "Terminal" to do script "${tmuxCmd}"' -e 'tell application "Terminal" to activate'`;
    } else {
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
            tmux_session: sessionName,
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

// ---------------------------------------------------------------------------
// PATCH /api/plans/[id]/session — Start/resume terminal streaming & get buffer
// ---------------------------------------------------------------------------

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidPlanId(id)) {
      return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
    }

    const mark2Dir = getMark2Dir();
    const db = getDb(mark2Dir);
    const latestSession = db
      .select()
      .from(schema.agentSessions)
      .where(eq(schema.agentSessions.task_id, id))
      .orderBy(desc(schema.agentSessions.started_at))
      .limit(1)
      .get();

    if (!latestSession) {
      return NextResponse.json(
        { error: 'No session found for this plan' },
        { status: 404 },
      );
    }

    const sessionName = latestSession.tmux_session;
    const alive = await isSessionAlive(sessionName);

    if (!alive) {
      return NextResponse.json(
        { error: 'No active tmux session for this plan' },
        { status: 404 },
      );
    }

    // Start/resume terminal streaming for this session
    const terminalStream = TerminalStream.getInstance();
    terminalStream.start(id, sessionName);

    // Capture and return the current buffer so the client can display history
    let buffer = '';
    try {
      buffer = await capturePane(sessionName, 500);
    } catch {
      // Ignore capture errors
    }

    return NextResponse.json({
      success: true,
      tmux_session: sessionName,
      agent_name: latestSession.agent_name,
      phase: latestSession.phase,
      buffer,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to start streaming' },
      { status: 500 },
    );
  }
}
