import fs from 'fs';
import path from 'path';

/**
 * Storage paths for a task's isolated storage directory.
 * All paths are absolute.
 */
export interface StoragePaths {
  /** Root storage directory: .mark2/storage/{taskId} */
  root: string;

  /** Prompt files: .mark2/storage/{taskId}/prompts */
  prompts: string;

  /** Artifact files: .mark2/storage/{taskId}/artifacts */
  artifacts: string;

  /** Session logs: .mark2/storage/{taskId}/sessions */
  sessions: string;

  /** Test run outputs (gitignored): .mark2/storage/{taskId}/test-runs */
  testRuns: string;

  /** Playwright reports (gitignored): .mark2/storage/{taskId}/playwright-reports */
  playwrightReports: string;
}

/**
 * Get storage paths for a given task.
 * All paths are absolute and derived from the project root.
 */
export function getTaskStoragePaths(projectRoot: string, taskId: string): StoragePaths {
  const root = path.join(projectRoot, '.mark2', 'storage', taskId);

  return {
    root,
    prompts: path.join(root, 'prompts'),
    artifacts: path.join(root, 'artifacts'),
    sessions: path.join(root, 'sessions'),
    testRuns: path.join(root, 'test-runs'),
    playwrightReports: path.join(root, 'playwright-reports'),
  };
}

/**
 * Get storage paths using the mark2 directory instead of project root.
 * Convenience function when mark2Dir is already known.
 */
export function getTaskStoragePathsFromMark2Dir(mark2Dir: string, taskId: string): StoragePaths {
  const projectRoot = path.dirname(mark2Dir);
  return getTaskStoragePaths(projectRoot, taskId);
}

/**
 * Ensure all storage directories exist for a task.
 * Creates directories with appropriate permissions.
 * Idempotent - safe to call multiple times.
 */
export async function ensureTaskStorageExists(projectRoot: string, taskId: string): Promise<void> {
  const paths = getTaskStoragePaths(projectRoot, taskId);

  // Create all directories
  const directories = [
    paths.root,
    paths.prompts,
    paths.artifacts,
    paths.sessions,
    paths.testRuns,
    paths.playwrightReports,
  ];

  for (const dir of directories) {
    await fs.promises.mkdir(dir, { recursive: true });
  }
}

/**
 * Synchronous version of ensureTaskStorageExists.
 * Use when async is not possible (e.g., in constructor).
 */
export function ensureTaskStorageExistsSync(projectRoot: string, taskId: string): void {
  const paths = getTaskStoragePaths(projectRoot, taskId);

  const directories = [
    paths.root,
    paths.prompts,
    paths.artifacts,
    paths.sessions,
    paths.testRuns,
    paths.playwrightReports,
  ];

  for (const dir of directories) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Resolve an artifact path from a relative path.
 *
 * Path resolution rules:
 * 1. If path starts with artifacts/, prompts/, or sessions/: use as-is relative to storage root
 * 2. Otherwise: prefix with artifacts/ (backwards compatible default)
 *
 * @param projectRoot - The project root directory
 * @param taskId - The task ID
 * @param relativePath - The relative path from the task definition (e.g., "design.md" or "artifacts/design.md")
 * @returns Absolute path to the artifact
 */
export function resolveArtifactPath(
  projectRoot: string,
  taskId: string,
  relativePath: string,
): string {
  const paths = getTaskStoragePaths(projectRoot, taskId);

  // Normalize the path to handle any OS-specific separators
  const normalizedPath = relativePath.replace(/\\/g, '/');

  // Check if path already has a known prefix
  if (
    normalizedPath.startsWith('artifacts/') ||
    normalizedPath.startsWith('prompts/') ||
    normalizedPath.startsWith('sessions/')
  ) {
    return path.join(paths.root, normalizedPath);
  }

  // Default to artifacts directory
  return path.join(paths.artifacts, normalizedPath);
}

/**
 * Resolve an artifact path using mark2Dir instead of projectRoot.
 */
export function resolveArtifactPathFromMark2Dir(
  mark2Dir: string,
  taskId: string,
  relativePath: string,
): string {
  const projectRoot = path.dirname(mark2Dir);
  return resolveArtifactPath(projectRoot, taskId, relativePath);
}

/**
 * Check if a file exists at the given path.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Synchronous version of fileExists.
 */
export function fileExistsSync(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Migrate an artifact from worktree location to storage location.
 * Used for backwards compatibility during migration period.
 *
 * @param projectRoot - The project root directory
 * @param taskId - The task ID
 * @param worktreePath - The path to the worktree
 * @param artifactRelativePath - The relative path of the artifact within the worktree
 * @returns The new absolute path in storage, or null if source doesn't exist
 */
export async function migrateArtifact(
  projectRoot: string,
  taskId: string,
  worktreePath: string,
  artifactRelativePath: string,
): Promise<string | null> {
  const sourcePath = path.join(worktreePath, artifactRelativePath);

  if (!await fileExists(sourcePath)) {
    return null;
  }

  // Ensure storage exists
  await ensureTaskStorageExists(projectRoot, taskId);

  // Determine destination
  const destPath = resolveArtifactPath(projectRoot, taskId, artifactRelativePath);

  // Create parent directory if needed
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

  // Copy file to storage
  await fs.promises.copyFile(sourcePath, destPath);

  return destPath;
}

/**
 * Get the worktree path for a task and phase.
 * Worktrees are stored in .worktrees/{taskId}/{phase}/
 */
export function getWorktreePath(projectRoot: string, taskId: string, phase: string): string {
  return path.join(projectRoot, '.worktrees', taskId, phase);
}

/**
 * Storage statistics for a task.
 */
export interface StorageStats {
  totalSize: number;
  promptsSize: number;
  artifactsSize: number;
  sessionsSize: number;
  testRunsSize: number;
  playwrightReportsSize: number;
  fileCount: number;
}

/**
 * Get storage statistics for a task.
 */
export async function getStorageStats(projectRoot: string, taskId: string): Promise<StorageStats> {
  const paths = getTaskStoragePaths(projectRoot, taskId);

  const stats: StorageStats = {
    totalSize: 0,
    promptsSize: 0,
    artifactsSize: 0,
    sessionsSize: 0,
    testRunsSize: 0,
    playwrightReportsSize: 0,
    fileCount: 0,
  };

  const calculateDirSize = async (dirPath: string): Promise<number> => {
    let size = 0;
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          size += await calculateDirSize(fullPath);
        } else if (entry.isFile()) {
          const stat = await fs.promises.stat(fullPath);
          size += stat.size;
          stats.fileCount++;
        }
      }
    } catch {
      // Directory doesn't exist
    }
    return size;
  };

  stats.promptsSize = await calculateDirSize(paths.prompts);
  stats.artifactsSize = await calculateDirSize(paths.artifacts);
  stats.sessionsSize = await calculateDirSize(paths.sessions);
  stats.testRunsSize = await calculateDirSize(paths.testRuns);
  stats.playwrightReportsSize = await calculateDirSize(paths.playwrightReports);
  stats.totalSize =
    stats.promptsSize +
    stats.artifactsSize +
    stats.sessionsSize +
    stats.testRunsSize +
    stats.playwrightReportsSize;

  return stats;
}
