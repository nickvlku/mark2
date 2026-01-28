import { execSync } from 'child_process';

export async function killSessionsCommand(): Promise<void> {
  let sessions: string[];
  try {
    const output = execSync("tmux list-sessions -F '#{session_name}' 2>/dev/null", {
      encoding: 'utf-8',
    });
    sessions = output
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.startsWith('mark2_'));
  } catch {
    // tmux list-sessions exits non-zero when no server is running
    sessions = [];
  }

  if (sessions.length === 0) {
    console.log('No mark2 tmux sessions found.');
    return;
  }

  for (const name of sessions) {
    try {
      execSync(`tmux kill-session -t ${name}`);
      console.log(`Killed session: ${name}`);
    } catch {
      console.error(`Failed to kill session: ${name}`);
    }
  }

  console.log(`Done. Killed ${sessions.length} session(s).`);
}
