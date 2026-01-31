import { exec as execCb } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCb);

export async function gitExec(command: string, cwd?: string): Promise<{ stdout: string; stderr: string }> {
  return exec(command, { cwd, maxBuffer: 10 * 1024 * 1024 });
}

export async function createWorktree(projectRoot: string, worktreePath: string, branchName: string): Promise<void> {
  await gitExec(`git fetch origin main`, projectRoot);
  try {
    await gitExec(`git branch "${branchName}" origin/main`, projectRoot);
  } catch {
    // Branch may already exist
  }
  await gitExec(`git worktree add "${worktreePath}" "${branchName}"`, projectRoot);
}

export async function removeWorktree(projectRoot: string, worktreePath: string, branchName: string): Promise<void> {
  try {
    await gitExec(`git worktree remove "${worktreePath}" --force`, projectRoot);
  } catch { /* may not exist */ }
  try {
    await gitExec(`git branch -D "${branchName}"`, projectRoot);
  } catch { /* may not exist */ }
}

export async function getDiff(worktreePath: string): Promise<string> {
  const { stdout } = await gitExec('git diff origin/main...HEAD', worktreePath);
  return stdout;
}

export async function gitAdd(filePath: string, cwd: string): Promise<void> {
  await gitExec(`git add "${filePath}"`, cwd);
}

export async function getBranches(cwd: string): Promise<{ branches: string[]; current: string }> {
  // Get all local branches
  const { stdout } = await gitExec('git branch --format="%(refname:short)"', cwd);
  const branches = stdout
    .split('\n')
    .map((b) => b.trim())
    .filter((b) => b.length > 0 && !b.startsWith('mark2/')); // Exclude mark2 task branches

  // Get current branch
  const { stdout: currentStdout } = await gitExec('git rev-parse --abbrev-ref HEAD', cwd);
  const current = currentStdout.trim();

  // Sort with main/master first
  branches.sort((a, b) => {
    if (a === 'main' || a === 'master') return -1;
    if (b === 'main' || b === 'master') return 1;
    return a.localeCompare(b);
  });

  return { branches, current };
}
