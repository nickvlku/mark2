import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import YAML from 'yaml';
import { getDb } from '../db';
import { activityEntries } from '../db/schema';
import { getMark2Dir } from '../utils/mark2-dir';

const exec = promisify(execCb);

export interface CloneInfo {
  taskId: string;
  clonePath: string;
  branchName: string;
  createdAt: string;
  status: 'active' | 'merged' | 'abandoned';
}

export interface CommitResult {
  success: boolean;
  sha?: string;
  error?: string;
}

export interface PushResult {
  success: boolean;
  error?: string;
}

export interface MergeResult {
  success: boolean;
  sha?: string;
  error?: string;
  conflicts?: string[];
}

export class CloneService {
  private mark2Dir: string;
  private projectRoot: string;
  private clonesDir: string;

  constructor(mark2Dir?: string) {
    this.mark2Dir = mark2Dir ?? getMark2Dir();
    this.projectRoot = path.dirname(this.mark2Dir);
    this.clonesDir = path.join(this.mark2Dir, 'clones');
  }

  /**
   * Get the clone directory path for a task.
   */
  getClonePath(taskId: string): string {
    return path.join(this.clonesDir, taskId);
  }

  /**
   * Get the branch name for a task.
   */
  getBranchName(taskId: string): string {
    return `mark2/${taskId}`;
  }

  /**
   * Check if a clone exists for a task.
   */
  cloneExists(taskId: string): boolean {
    const clonePath = this.getClonePath(taskId);
    const gitDir = path.join(clonePath, '.git');
    return fs.existsSync(gitDir);
  }

  /**
   * Create a clone of the project repo for a task.
   * Uses file:// protocol to clone from the local repo.
   */
  async createClone(taskId: string): Promise<CloneInfo> {
    const clonePath = this.getClonePath(taskId);
    const branchName = this.getBranchName(taskId);
    const now = new Date().toISOString();

    // Ensure clones directory exists
    if (!fs.existsSync(this.clonesDir)) {
      fs.mkdirSync(this.clonesDir, { recursive: true });
    }

    // If clone already exists, verify it's valid
    if (this.cloneExists(taskId)) {
      // Reset to clean state
      await exec(`git -C "${clonePath}" fetch origin`);
      await exec(`git -C "${clonePath}" checkout -B "${branchName}" origin/HEAD`);
      await exec(`git -C "${clonePath}" clean -fd`);
      await exec(`git -C "${clonePath}" reset --hard`);

      this.logActivity(taskId, 'Clone reset to clean state');

      return {
        taskId,
        clonePath,
        branchName,
        createdAt: now,
        status: 'active',
      };
    }

    // Remove any leftover directory that isn't a valid clone
    if (fs.existsSync(clonePath)) {
      fs.rmSync(clonePath, { recursive: true });
    }

    // Clone using file:// protocol (no auth needed, fast local clone)
    const repoUrl = `file://${this.projectRoot}`;

    try {
      // Clone with depth 1 for speed, but we may need full history for some operations
      // Using --single-branch to only get the main branch initially
      await exec(`git clone --single-branch "${repoUrl}" "${clonePath}"`);

      // Create and checkout the task branch
      await exec(`git -C "${clonePath}" checkout -b "${branchName}"`);

      // Set up the origin to point back to the main repo for pushing
      await exec(`git -C "${clonePath}" remote set-url origin "${repoUrl}"`);

      this.logActivity(taskId, `Clone created at ${clonePath}, branch: ${branchName}`);

      return {
        taskId,
        clonePath,
        branchName,
        createdAt: now,
        status: 'active',
      };
    } catch (error: any) {
      // Clean up on failure
      if (fs.existsSync(clonePath)) {
        fs.rmSync(clonePath, { recursive: true });
      }
      throw new Error(`Failed to create clone: ${error.message}`);
    }
  }

  /**
   * Copy task-specific .mark2 files from main repo to clone.
   * This ensures task metadata, activity, and artifacts are included in commits.
   */
  private syncMark2FilesToClone(taskId: string): void {
    const clonePath = this.getClonePath(taskId);
    const cloneMark2Dir = path.join(clonePath, '.mark2');

    // Ensure .mark2 directories exist in clone
    const dirs = ['tasks', 'stories', 'artifacts', 'storage'];
    for (const dir of dirs) {
      const dirPath = path.join(cloneMark2Dir, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }

    // Copy task YAML file (from state directory)
    const taskYaml = `${taskId}.yaml`;
    const taskYamlSrc = path.join(this.mark2Dir, '.state', 'tasks', taskYaml);
    const taskYamlDst = path.join(cloneMark2Dir, 'tasks', taskYaml);
    if (fs.existsSync(taskYamlSrc)) {
      fs.copyFileSync(taskYamlSrc, taskYamlDst);
    }

    // Copy task activity file (from state directory)
    const activityYaml = `${taskId}.activity.yaml`;
    const activitySrc = path.join(this.mark2Dir, '.state', 'tasks', activityYaml);
    const activityDst = path.join(cloneMark2Dir, 'tasks', activityYaml);
    if (fs.existsSync(activitySrc)) {
      fs.copyFileSync(activitySrc, activityDst);
    }

    // Copy task artifacts directory if it exists
    const artifactsSrc = path.join(this.mark2Dir, 'artifacts', taskId);
    const artifactsDst = path.join(cloneMark2Dir, 'artifacts', taskId);
    if (fs.existsSync(artifactsSrc)) {
      if (!fs.existsSync(artifactsDst)) {
        fs.mkdirSync(artifactsDst, { recursive: true });
      }
      // Copy all files in the artifacts directory
      const files = fs.readdirSync(artifactsSrc);
      for (const file of files) {
        fs.copyFileSync(
          path.join(artifactsSrc, file),
          path.join(artifactsDst, file)
        );
      }
    }

    // Copy config files (agents.yaml, config.yaml) if they don't exist in clone
    const configFiles = ['agents.yaml', 'config.yaml', 'context.json'];
    for (const configFile of configFiles) {
      const src = path.join(this.mark2Dir, configFile);
      const dst = path.join(cloneMark2Dir, configFile);
      if (fs.existsSync(src) && !fs.existsSync(dst)) {
        fs.copyFileSync(src, dst);
      }
    }

    // Copy story file if task belongs to a story
    if (fs.existsSync(taskYamlSrc)) {
      try {
        const taskContent = fs.readFileSync(taskYamlSrc, 'utf-8');
        const taskData = YAML.parse(taskContent);
        if (taskData?.story_id) {
          const storyYaml = `${taskData.story_id}.yaml`;
          const storySrc = path.join(this.mark2Dir, 'stories', storyYaml);
          const storyDst = path.join(cloneMark2Dir, 'stories', storyYaml);
          if (fs.existsSync(storySrc)) {
            fs.copyFileSync(storySrc, storyDst);
          }
        }
      } catch {
        // Ignore YAML parsing errors
      }
    }
  }

  /**
   * Commit staged changes in the clone.
   * The agent should stage files before calling this.
   */
  async commit(taskId: string, message: string): Promise<CommitResult> {
    const clonePath = this.getClonePath(taskId);

    if (!this.cloneExists(taskId)) {
      return { success: false, error: 'Clone does not exist' };
    }

    try {
      // Sync .mark2 files from main repo to clone before committing
      this.syncMark2FilesToClone(taskId);

      // Check if there are staged changes
      const { stdout: status } = await exec(`git -C "${clonePath}" diff --cached --name-only`);

      if (!status.trim()) {
        // Nothing staged, try to stage all changes
        await exec(`git -C "${clonePath}" add -A`);

        // Check again
        const { stdout: status2 } = await exec(`git -C "${clonePath}" diff --cached --name-only`);
        if (!status2.trim()) {
          return { success: false, error: 'No changes to commit' };
        }
      }

      // Commit with the provided message
      const commitMessage = message || 'Changes by Mark2 agent';
      await exec(`git -C "${clonePath}" commit -m ${JSON.stringify(commitMessage)}`);

      // Get the commit SHA
      const { stdout: sha } = await exec(`git -C "${clonePath}" rev-parse HEAD`);

      this.logActivity(taskId, `Committed: ${sha.trim().substring(0, 7)} - ${commitMessage}`);

      return { success: true, sha: sha.trim() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Stage specific files for commit.
   */
  async stageFiles(taskId: string, files: string[]): Promise<{ success: boolean; error?: string }> {
    const clonePath = this.getClonePath(taskId);

    if (!this.cloneExists(taskId)) {
      return { success: false, error: 'Clone does not exist' };
    }

    try {
      for (const file of files) {
        await exec(`git -C "${clonePath}" add ${JSON.stringify(file)}`);
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Stage all changes for commit.
   */
  async stageAll(taskId: string): Promise<{ success: boolean; error?: string }> {
    const clonePath = this.getClonePath(taskId);

    if (!this.cloneExists(taskId)) {
      return { success: false, error: 'Clone does not exist' };
    }

    try {
      await exec(`git -C "${clonePath}" add -A`);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Push the task branch to the origin (main repo).
   */
  async push(taskId: string): Promise<PushResult> {
    const clonePath = this.getClonePath(taskId);
    const branchName = this.getBranchName(taskId);

    if (!this.cloneExists(taskId)) {
      return { success: false, error: 'Clone does not exist' };
    }

    try {
      // Sync .mark2 files and commit any changes before pushing
      this.syncMark2FilesToClone(taskId);

      // Check if there are uncommitted .mark2 changes to include
      const { stdout: status } = await exec(`git -C "${clonePath}" status --porcelain .mark2`);
      if (status.trim()) {
        await exec(`git -C "${clonePath}" add .mark2`);
        await exec(`git -C "${clonePath}" commit -m "Update task metadata" --allow-empty`).catch(() => {
          // Ignore if nothing to commit
        });
      }

      // Push with force to allow for rebases
      await exec(`git -C "${clonePath}" push -u origin "${branchName}" --force`);

      this.logActivity(taskId, `Pushed branch ${branchName} to origin`);

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Merge the task branch into the main branch.
   * This is called from the main repo, not the clone.
   */
  async merge(taskId: string, strategy: 'merge' | 'squash' | 'rebase' = 'squash'): Promise<MergeResult> {
    const branchName = this.getBranchName(taskId);

    try {
      // Fetch the branch in the main repo
      await exec(`git -C "${this.projectRoot}" fetch origin "${branchName}"`);

      // Get current branch
      const { stdout: currentBranch } = await exec(`git -C "${this.projectRoot}" rev-parse --abbrev-ref HEAD`);

      if (strategy === 'squash') {
        // Squash merge
        await exec(`git -C "${this.projectRoot}" merge --squash "origin/${branchName}"`);
        await exec(`git -C "${this.projectRoot}" commit -m "Merge ${taskId}: squashed commits"`);
      } else if (strategy === 'rebase') {
        // Rebase (apply commits on top of current branch)
        await exec(`git -C "${this.projectRoot}" rebase "origin/${branchName}"`);
      } else {
        // Regular merge
        await exec(`git -C "${this.projectRoot}" merge "origin/${branchName}" -m "Merge ${taskId}"`);
      }

      // Get the resulting commit SHA
      const { stdout: sha } = await exec(`git -C "${this.projectRoot}" rev-parse HEAD`);

      this.logActivity(taskId, `Merged to ${currentBranch.trim()} using ${strategy} strategy`);

      return { success: true, sha: sha.trim() };
    } catch (error: any) {
      // Check for merge conflicts
      if (error.message.includes('CONFLICT') || error.message.includes('conflict')) {
        const { stdout: conflicts } = await exec(
          `git -C "${this.projectRoot}" diff --name-only --diff-filter=U`
        ).catch(() => ({ stdout: '' }));

        return {
          success: false,
          error: 'Merge conflicts detected',
          conflicts: conflicts.trim().split('\n').filter(Boolean),
        };
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * Sync the clone with the latest changes from main.
   * Useful for long-running tasks.
   */
  async sync(taskId: string): Promise<{ success: boolean; error?: string; rebased?: boolean }> {
    const clonePath = this.getClonePath(taskId);
    const branchName = this.getBranchName(taskId);

    if (!this.cloneExists(taskId)) {
      return { success: false, error: 'Clone does not exist' };
    }

    try {
      // Fetch latest from origin
      await exec(`git -C "${clonePath}" fetch origin`);

      // Try to rebase on origin's HEAD (main branch)
      try {
        await exec(`git -C "${clonePath}" rebase origin/HEAD`);
        this.logActivity(taskId, 'Synced with latest changes from main');
        return { success: true, rebased: true };
      } catch (rebaseError: any) {
        // Abort rebase if it fails
        await exec(`git -C "${clonePath}" rebase --abort`).catch(() => {});
        return { success: false, error: 'Rebase failed, manual resolution needed' };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get the diff of all changes on the task branch (committed + uncommitted).
   * This shows everything that would be merged back to main.
   */
  async getDiff(taskId: string): Promise<{ diff: string; error?: string }> {
    const clonePath = this.getClonePath(taskId);

    if (!this.cloneExists(taskId)) {
      return { diff: '', error: 'Clone does not exist' };
    }

    try {
      // Get the merge base (where this branch diverged from origin/HEAD)
      const { stdout: mergeBase } = await exec(
        `git -C "${clonePath}" merge-base origin/HEAD HEAD`
      );
      const base = mergeBase.trim();

      // Get diff from merge base to current working tree (includes uncommitted changes)
      const { stdout: diff } = await exec(`git -C "${clonePath}" diff ${base}`);
      return { diff };
    } catch (error: any) {
      return { diff: '', error: error.message };
    }
  }

  /**
   * Get the status of the clone.
   */
  async getStatus(taskId: string): Promise<{ status: string; error?: string }> {
    const clonePath = this.getClonePath(taskId);

    if (!this.cloneExists(taskId)) {
      return { status: '', error: 'Clone does not exist' };
    }

    try {
      const { stdout: status } = await exec(`git -C "${clonePath}" status --short`);
      return { status };
    } catch (error: any) {
      return { status: '', error: error.message };
    }
  }

  /**
   * Delete the clone for a task.
   */
  async deleteClone(taskId: string): Promise<void> {
    const clonePath = this.getClonePath(taskId);

    if (fs.existsSync(clonePath)) {
      fs.rmSync(clonePath, { recursive: true });
      this.logActivity(taskId, 'Clone deleted');
    }
  }

  /**
   * List all clones.
   */
  listClones(): CloneInfo[] {
    if (!fs.existsSync(this.clonesDir)) {
      return [];
    }

    const entries = fs.readdirSync(this.clonesDir, { withFileTypes: true });
    const clones: CloneInfo[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const taskId = entry.name;
        const clonePath = this.getClonePath(taskId);
        const gitDir = path.join(clonePath, '.git');

        if (fs.existsSync(gitDir)) {
          clones.push({
            taskId,
            clonePath,
            branchName: this.getBranchName(taskId),
            createdAt: fs.statSync(clonePath).birthtime.toISOString(),
            status: 'active', // Would need to track this properly
          });
        }
      }
    }

    return clones;
  }

  /**
   * Log activity for a task.
   */
  private logActivity(taskId: string, message: string): void {
    try {
      const db = getDb(this.mark2Dir);
      db.insert(activityEntries)
        .values({
          task_id: taskId,
          timestamp: new Date().toISOString(),
          source: 'git',
          type: 'note',
          message,
        })
        .run();
    } catch {
      // Ignore logging errors
    }
  }
}
