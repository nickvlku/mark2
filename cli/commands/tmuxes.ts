import { execSync, execFileSync, spawn } from 'child_process';
import { select } from '@inquirer/prompts';

interface TmuxSession {
  name: string;
  windows: number;
  created: string;
  attached: boolean;
  size: string;
}

export async function tmuxesCommand(): Promise<void> {
  // Check if tmux is available
  if (!isTmuxAvailable()) {
    console.error('Error: tmux is not installed or not available in PATH.');
    process.exit(1);
  }

  // Get tmux sessions
  const sessions = getTmuxSessions();

  if (sessions.length === 0) {
    console.log('No tmux sessions found.');
    return;
  }

  try {
    // Show interactive selection
    const selectedSession = await selectSession(sessions);

    if (selectedSession) {
      await attachToSession(selectedSession);
    }
  } catch (error) {
    // User cancelled or error occurred
    if (error instanceof Error && (
      error.message.includes('cancelled') ||
      error.message.includes('User force closed')
    )) {
      console.log('\nOperation cancelled.');
      return;
    }
    console.error('Error:', error);
    process.exit(1);
  }
}

function isTmuxAvailable(): boolean {
  try {
    execFileSync('which', ['tmux'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getTmuxSessions(): TmuxSession[] {
  try {
    // Use tmux list-sessions with format to get detailed information
    // Use session_created as timestamp for more reliable parsing
    // Using execFileSync to avoid shell interpretation for security
    const output = execFileSync('tmux', [
      'list-sessions',
      '-F',
      '#{session_name}|#{session_windows}|#{session_created}|#{?session_attached,attached,detached}|#{window_width}x#{window_height}'
    ], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'] // Suppress stderr
    });

    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map(parseSessionLine)
      .filter((session): session is TmuxSession => session !== null);
  } catch {
    // tmux list-sessions exits non-zero when no server is running
    return [];
  }
}

function parseSessionLine(line: string): TmuxSession | null {
  const parts = line.split('|');
  if (parts.length !== 5) {
    return null;
  }

  const [name, windowsStr, createdTimestamp, attachedStr, size] = parts;
  const windows = parseInt(windowsStr, 10);
  const attached = attachedStr === 'attached';

  if (isNaN(windows)) {
    return null;
  }

  // Convert timestamp to human readable format
  const createdTime = parseInt(createdTimestamp, 10);
  const created = formatTimeAgo(createdTime);

  return {
    name,
    windows,
    created,
    attached,
    size,
  };
}

function formatTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diffSeconds = now - timestamp;

  if (diffSeconds < 60) {
    return 'just now';
  } else if (diffSeconds < 3600) {
    const minutes = Math.floor(diffSeconds / 60);
    return `${minutes}m ago`;
  } else if (diffSeconds < 86400) {
    const hours = Math.floor(diffSeconds / 3600);
    return `${hours}h ago`;
  } else {
    const days = Math.floor(diffSeconds / 86400);
    return `${days}d ago`;
  }
}

async function selectSession(sessions: TmuxSession[]): Promise<string | null> {
  // Find the longest session name for consistent formatting
  const maxNameLength = Math.max(...sessions.map(s => s.name.length));
  const nameWidth = Math.min(maxNameLength + 2, 40); // Cap at 40 characters

  const choices = sessions.map((session) => {
    const attachedIndicator = session.attached ? ' (attached)' : '';
    const windowText = session.windows === 1 ? 'window' : 'windows';

    // Truncate long session names
    const displayName = session.name.length > 38
      ? session.name.substring(0, 35) + '...'
      : session.name;

    const label = `${displayName.padEnd(nameWidth)} [${session.windows} ${windowText}]${attachedIndicator.padEnd(12)} ${session.size.padEnd(10)} ${session.created}`;

    return {
      name: label,
      value: session.name,
    };
  });

  const selectedSession = await select({
    message: 'Select a tmux session:',
    choices,
  });

  return selectedSession;
}

async function attachToSession(sessionName: string): Promise<void> {
  console.log(`\nAttaching to tmux session: ${sessionName}`);

  // Use spawn to attach to the session interactively
  // This will take over the terminal until the user detaches
  // Note: We intentionally don't use shell: true here to avoid shell injection risks
  // The array form of arguments ensures sessionName is properly escaped
  const child = spawn('tmux', ['attach-session', '-t', sessionName], {
    stdio: 'inherit',
  });

  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Failed to attach to session ${sessionName}. Exit code: ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to attach to session ${sessionName}: ${error.message}`));
    });
  });
}