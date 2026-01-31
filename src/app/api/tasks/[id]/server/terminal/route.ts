import { NextResponse } from 'next/server';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { isValidTaskId } from '@/lib/utils/route-validation';

const exec = promisify(execCb);

function devServerSessionName(taskId: string): string {
  return `mark2_${taskId}_devserver`;
}

async function isSessionAlive(sessionName: string): Promise<boolean> {
  try {
    await exec(`tmux has-session -t "${sessionName}"`);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// POST /api/tasks/[id]/server/terminal — Open dev server tmux in native terminal
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
    const sessionName = devServerSessionName(id);

    // Check if session exists
    if (!(await isSessionAlive(sessionName))) {
      return NextResponse.json(
        { error: 'No dev server session running' },
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
      execCb(shellCmd, { timeout: 5000 }, (error, stdout) => {
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
            session: sessionName,
            manual_command: tmuxCmd,
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
