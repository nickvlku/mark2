import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * Validate that a path is inside the .worktrees directory.
 * Throws an error if the path is not a valid worktree location.
 */
export function validateWorktreePath(
  workingDir: string,
  projectRoot: string,
  taskId: string,
): void {
  const worktreesDir = path.join(projectRoot, '.worktrees');
  const resolved = path.resolve(workingDir);
  const expectedPrefix = path.resolve(worktreesDir);

  if (!resolved.startsWith(expectedPrefix)) {
    throw new Error(
      `SAFETY VIOLATION: Working directory "${workingDir}" is not inside .worktrees/. ` +
      `This could cause code to be written to the main project instead of the task worktree.`
    );
  }

  // Also verify the path contains the task ID
  if (!resolved.includes(taskId)) {
    throw new Error(
      `SAFETY VIOLATION: Working directory "${workingDir}" does not contain task ID "${taskId}".`
    );
  }
}

/**
 * Check if the main project has uncommitted changes that might be from an agent.
 * Returns a list of modified files if contamination is detected.
 */
export function checkMainBranchContamination(projectRoot: string): string[] {
  try {
    const result = execSync('git status --porcelain', {
      cwd: projectRoot,
      encoding: 'utf-8',
    });

    // Filter for modified source files (not .mark2, not worktrees)
    const lines = result.trim().split('\n').filter(Boolean);
    const contaminatedFiles = lines.filter((line) => {
      const file = line.slice(3); // Remove status prefix
      return (
        !file.startsWith('.mark2/') &&
        !file.startsWith('.worktrees/') &&
        !file.includes('mark2.db') &&
        (file.endsWith('.ts') ||
          file.endsWith('.tsx') ||
          file.endsWith('.js') ||
          file.endsWith('.json') ||
          file.endsWith('.md'))
      );
    });

    return contaminatedFiles.map((line) => line.slice(3));
  } catch {
    return [];
  }
}

/**
 * Verify that the working directory is a valid git worktree.
 */
export function isValidGitWorktree(workingDir: string): boolean {
  try {
    const result = execSync('git rev-parse --is-inside-work-tree', {
      cwd: workingDir,
      encoding: 'utf-8',
    });
    return result.trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * Get the git root of the working directory to verify it's not the main project.
 */
export function getGitRoot(workingDir: string): string | null {
  try {
    const result = execSync('git rev-parse --show-toplevel', {
      cwd: workingDir,
      encoding: 'utf-8',
    });
    return result.trim();
  } catch {
    return null;
  }
}

/**
 * Comprehensive safety check before starting an agent.
 * Throws if any safety condition is violated.
 */
export function performSafetyChecks(
  workingDir: string,
  projectRoot: string,
  taskId: string,
): void {
  // 1. Validate the working directory is in .worktrees
  validateWorktreePath(workingDir, projectRoot, taskId);

  // 2. Verify it's a valid git worktree
  if (!isValidGitWorktree(workingDir)) {
    throw new Error(
      `SAFETY WARNING: Working directory "${workingDir}" is not a valid git worktree.`
    );
  }

  // 3. Verify the git root is the worktree, not the main project
  const gitRoot = getGitRoot(workingDir);
  const mainProjectRoot = path.resolve(projectRoot);

  if (gitRoot === mainProjectRoot) {
    throw new Error(
      `SAFETY VIOLATION: Git root "${gitRoot}" is the main project! ` +
      `Agent would write directly to main instead of the worktree.`
    );
  }

  // 4. Check for existing contamination in main
  const contamination = checkMainBranchContamination(projectRoot);
  if (contamination.length > 0) {
    console.warn(
      `[safety] WARNING: Main project has ${contamination.length} uncommitted source files. ` +
      `This may indicate contamination from a previous agent run: ${contamination.slice(0, 5).join(', ')}${contamination.length > 5 ? '...' : ''}`
    );
  }
}
