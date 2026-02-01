import fs from 'fs';
import path from 'path';

/**
 * Find the .mark2 directory by traversing upward from the given start directory.
 * Returns null if not found.
 */
function findMark2DirUp(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const candidate = path.join(currentDir, '.mark2');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
    currentDir = path.dirname(currentDir);
  }

  // Check root as well
  const rootCandidate = path.join(root, '.mark2');
  if (fs.existsSync(rootCandidate) && fs.statSync(rootCandidate).isDirectory()) {
    return rootCandidate;
  }

  return null;
}

/**
 * Get the .mark2 directory path.
 * Priority:
 * 1. MARK2_DIR environment variable (if set)
 * 2. Find .mark2 by traversing up from cwd
 * 3. Default to process.cwd()/.mark2
 */
export function getMark2Dir(): string {
  // Priority 1: Environment variable
  if (process.env.MARK2_DIR) {
    return process.env.MARK2_DIR;
  }

  // Priority 2: Find up from cwd
  const found = findMark2DirUp(process.cwd());
  if (found) {
    return found;
  }

  // Priority 3: Default to cwd/.mark2
  return path.join(process.cwd(), '.mark2');
}

/**
 * Get the project root directory (parent of .mark2).
 * Uses the same priority as getMark2Dir().
 */
export function getProjectRoot(): string {
  const mark2Dir = getMark2Dir();
  return path.dirname(mark2Dir);
}

/**
 * Check if a .mark2 directory exists at the resolved path.
 */
export function mark2DirExists(): boolean {
  const dir = getMark2Dir();
  return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
}
