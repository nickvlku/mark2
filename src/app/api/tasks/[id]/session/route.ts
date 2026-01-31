import { NextResponse } from 'next/server';
import { getDb, schema } from '@/lib/db';
import { eq, and, desc } from 'drizzle-orm';
import { exec } from 'child_process';
import { isSessionAlive, capturePane } from '@/lib/utils/tmux';
import { TerminalStream } from '@/lib/ws/terminal-stream';
import { isValidTaskId } from '@/lib/utils/route-validation';

// ---------------------------------------------------------------------------
// GET /api/tasks/[id]/session — Return active tmux session info for a task
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidTaskId(id)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }

    // Simplified for roles system - discover active tmux sessions for the task
    const { listMark2Sessions } = await import('@/lib/utils/tmux');
    const allSessions = await listMark2Sessions();

    // Find sessions that belong to this task
    const taskSessions = allSessions.filter(sessionName => sessionName.includes(id));

    // Find any session that is actually alive
    let session = null;
    for (const sessionName of taskSessions) {
      const alive = await isSessionAlive(sessionName);
      if (alive) {
        // Extract phase from session name pattern (mark2_TASK-X_role_phase)
        const parts = sessionName.split('_');
        const phase = parts.length >= 4 ? parts[3] : 'unknown';

        session = {
          tmux_session: sessionName,
          agent_name: `role-${phase}`,
          phase: phase,
          status: 'running', // Since we found an alive session
        };
        break;
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
    if (!isValidTaskId(id)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }
    // Find active tmux sessions for this task (simplified for roles system)
    const { listMark2Sessions } = await import('@/lib/utils/tmux');
    const allSessions = await listMark2Sessions();
    const taskSessions = allSessions.filter(sessionName => sessionName.includes(id));

    // Find a session with an alive tmux
    let sessionName = null;
    for (const name of taskSessions) {
      const alive = await isSessionAlive(name);
      if (alive) {
        sessionName = name;
        break;
      }
    }

    if (!sessionName) {
      return NextResponse.json(
        { error: 'No active tmux session for this task' },
        { status: 404 },
      );
    }

    const tmuxCmd = `tmux attach-session -t ${sessionName}`;
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
// PATCH /api/tasks/[id]/session — Start/resume terminal streaming & get buffer
// ---------------------------------------------------------------------------

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidTaskId(id)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }
    // Find an active tmux session for this task (simplified for roles system)
    const { listMark2Sessions } = await import('@/lib/utils/tmux');
    const allSessions = await listMark2Sessions();
    const taskSessions = allSessions.filter(sessionName => sessionName.includes(id));

    let sessionName = null;
    for (const name of taskSessions) {
      const alive = await isSessionAlive(name);
      if (alive) {
        sessionName = name;
        break;
      }
    }

    if (!sessionName) {
      return NextResponse.json(
        { error: 'No active tmux session for this task' },
        { status: 404 },
      );
    }

    // Start/resume terminal streaming for this session
    const terminalStream = TerminalStream.getInstance();
    terminalStream.start(id, sessionName);

    // Extract phase from session name for simplified role system
    const parts = sessionName.split('_');
    const phase = parts.length >= 4 ? parts[3] : 'unknown';

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
      agent_name: `role-${phase}`,
      phase: phase,
      buffer,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to start streaming' },
      { status: 500 },
    );
  }
}
