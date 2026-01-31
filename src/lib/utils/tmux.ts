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
  // Use single quotes to prevent shell expansion of $(), backticks, etc.
  // Escape any single quotes within the command by ending the quote, adding escaped quote, starting new quote
  const escaped = command.replace(/'/g, "'\\''");
  await exec(`tmux send-keys -t "${name}" '${escaped}' Enter`);
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

/**
 * Deliver a prompt file into a tmux session using load-buffer + paste-buffer.
 * This is used for interactive CLI tools (e.g. Claude Code) where we need to
 * paste the prompt into stdin after the tool has started.
 */
export async function sendPromptFile(
  sessionName: string,
  filePath: string,
  delayMs: number = 5000,
): Promise<void> {
  console.log(`[tmux] sendPromptFile: waiting ${delayMs}ms for ${sessionName} to initialize...`);
  // Wait for the CLI tool to fully initialize before pasting
  await new Promise((resolve) => setTimeout(resolve, delayMs));

  console.log(`[tmux] sendPromptFile: loading buffer from ${filePath}`);
  await exec(`tmux load-buffer "${filePath}"`);

  console.log(`[tmux] sendPromptFile: pasting buffer into ${sessionName}`);
  await exec(`tmux paste-buffer -t "${sessionName}"`);

  // Wait for the TUI to process the pasted content
  console.log(`[tmux] sendPromptFile: waiting 1s before sending Enter`);
  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log(`[tmux] sendPromptFile: sending Enter to ${sessionName}`);
  await exec(`tmux send-keys -t "${sessionName}" Enter`);
  console.log(`[tmux] sendPromptFile: done for ${sessionName}`);
}

export async function isSessionAlive(name: string): Promise<boolean> {
  try {
    await exec(`tmux has-session -t "${name}"`);
    return true;
  } catch {
    return false;
  }
}
