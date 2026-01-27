import { exec as execCb } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCb);

export function sessionName(taskId: string, agentName: string, phase: string): string {
  return `mark2_${taskId}_${agentName}_${phase}`;
}

export async function createSession(name: string, workingDir: string): Promise<void> {
  await exec(`tmux new-session -d -s "${name}" -c "${workingDir}"`);
}

export async function sendCommand(name: string, command: string): Promise<void> {
  await exec(`tmux send-keys -t "${name}" ${JSON.stringify(command)} Enter`);
}

export async function capturePane(name: string, lines: number = 50): Promise<string> {
  try {
    const { stdout } = await exec(`tmux capture-pane -t "${name}" -p -S -${lines}`);
    return stdout;
  } catch {
    return '';
  }
}

export async function killSession(name: string): Promise<void> {
  try {
    await exec(`tmux kill-session -t "${name}"`);
  } catch {
    // Session may already be dead
  }
}

export async function listMark2Sessions(): Promise<string[]> {
  try {
    const { stdout } = await exec('tmux list-sessions -F "#{session_name}" 2>/dev/null | grep "^mark2_"');
    return stdout.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

export async function isSessionAlive(name: string): Promise<boolean> {
  try {
    await exec(`tmux has-session -t "${name}"`);
    return true;
  } catch {
    return false;
  }
}
