import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export type OpenTmuxSessionResult =
  | {
      success: true;
      tmux_session: string;
    }
  | {
      success: false;
      error: string;
      manual_command: string;
    };

export async function openTmuxSessionInNativeTerminal(
  sessionName: string,
): Promise<OpenTmuxSessionResult> {
  // Validate session name to prevent command injection
  // Only allow alphanumeric, underscore, hyphen, and dot
  const sessionNameRegex = /^[a-zA-Z0-9_.-]+$/;
  if (!sessionNameRegex.test(sessionName)) {
    return {
      success: false,
      error: 'Invalid session name format',
      manual_command: 'tmux attach-session -t <session>',
    };
  }

  const manualCommand = `tmux attach-session -t ${sessionName}`;
  const platform = process.platform;

  let shellCmd: string;

  if (platform === 'darwin') {
    shellCmd =
      `osascript -e 'tell application "Terminal" to do script "${manualCommand}"' ` +
      `-e 'tell application "Terminal" to activate'`;
  } else {
    shellCmd = `
      if command -v kitty >/dev/null 2>&1; then
        kitty ${manualCommand} &
      elif command -v x-terminal-emulator >/dev/null 2>&1; then
        x-terminal-emulator -e ${manualCommand} &
      elif command -v gnome-terminal >/dev/null 2>&1; then
        gnome-terminal -- ${manualCommand} &
      elif command -v konsole >/dev/null 2>&1; then
        konsole -e ${manualCommand} &
      elif command -v xterm >/dev/null 2>&1; then
        xterm -e ${manualCommand} &
      else
        echo "NO_TERMINAL_FOUND"
      fi
    `;
  }

  try {
    const { stdout } = await execAsync(shellCmd, { timeout: 5000 });

    if (stdout?.trim() === 'NO_TERMINAL_FOUND') {
      return {
        success: false,
        error: 'No supported terminal emulator found',
        manual_command: manualCommand,
      };
    }

    return {
      success: true,
      tmux_session: sessionName,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message ?? 'Failed to open terminal',
      manual_command: manualCommand,
    };
  }
}
