import { NextResponse } from 'next/server';
import { exec as execCb } from 'child_process';
import path from 'path';
import fs from 'fs';

// ---------------------------------------------------------------------------
// POST /api/tasks/[id]/terminal — Open a terminal in the task's clone directory
// ---------------------------------------------------------------------------

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const projectRoot = process.cwd();
    const clonePath = path.join(projectRoot, '.mark2', 'clones', id);

    // Check if clone directory exists
    if (!fs.existsSync(clonePath)) {
      return NextResponse.json(
        { error: `Clone directory not found for task ${id}` },
        { status: 404 },
      );
    }

    const platform = process.platform;
    let shellCmd: string;

    if (platform === 'darwin') {
      // macOS: use osascript to open Terminal.app in the clone directory
      shellCmd = `osascript -e 'tell application "Terminal" to do script "cd ${clonePath} && exec $SHELL"' -e 'tell application "Terminal" to activate'`;
    } else {
      // Linux: try common terminal emulators in order
      shellCmd = `
        if command -v kitty >/dev/null 2>&1; then
          kitty --directory="${clonePath}" &
        elif command -v x-terminal-emulator >/dev/null 2>&1; then
          x-terminal-emulator --working-directory="${clonePath}" &
        elif command -v gnome-terminal >/dev/null 2>&1; then
          gnome-terminal --working-directory="${clonePath}" &
        elif command -v konsole >/dev/null 2>&1; then
          konsole --workdir "${clonePath}" &
        elif command -v xterm >/dev/null 2>&1; then
          xterm -e "cd ${clonePath} && exec $SHELL" &
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
                clone_path: clonePath,
              },
              { status: 500 },
            ),
          );
          return;
        }
        if (error) {
          resolve(
            NextResponse.json(
              { error: error.message, clone_path: clonePath },
              { status: 500 },
            ),
          );
          return;
        }
        resolve(
          NextResponse.json({
            success: true,
            clone_path: clonePath,
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
