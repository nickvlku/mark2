import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const exec = promisify(execCb);

export function sessionName(taskId: string, agentName: string, phase: string): string {
  return `mark2_${taskId}_${agentName}_${phase}`;
}

export async function createSession(name: string, workingDir: string): Promise<void> {
  await exec(`tmux new-session -d -s "${name}" -c "${workingDir}"`);
}

export async function sendCommand(name: string, command: string): Promise<void> {
  // For short, simple commands (like export statements), use inline send-keys
  const isSimple = command.startsWith('export ') && !command.includes('\n') && command.length < 500;

  if (isSimple) {
    // Simple command - escape single quotes and send inline
    const escaped = command.replace(/'/g, "'\\''");
    await exec(`tmux send-keys -t "${name}" '${escaped}' Enter`);
  } else {
    // Complex/long command - write to temp file and source it
    const tmpDir = path.join(os.tmpdir(), 'mark2-tmux');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, `cmd-${Date.now()}-${Math.random().toString(36).slice(2)}.sh`);

    // Write the command to a temp file (the command itself, not a script)
    fs.writeFileSync(tmpFile, command, 'utf-8');

    // Tell tmux to eval the file contents, then remove it
    // Using $(<file) to read file contents avoids argument length limits
    await exec(`tmux send-keys -t "${name}" 'eval "$(<${tmpFile})" ; rm -f "${tmpFile}"' Enter`);
  }
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
