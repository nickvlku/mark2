import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync, spawnSync, exec as execCb } from 'child_process';
import { promisify } from 'util';
import YAML from 'yaml';

const execAsync = promisify(execCb);
import { getMark2Dir, getProjectRoot } from '../utils/mark2-dir';

export interface LockInfo {
  locked_by: string;
  email: string;
  locked_at: string;
  machine: string;
}

export interface SyncResult {
  success: boolean;
  updated: boolean;
  message: string;
  conflicts?: string[];
}

export interface LockResult {
  success: boolean;
  lock?: LockInfo;
  error?: string;
  existingLock?: LockInfo;
}

export interface StateSyncConfig {
  lock_timeout_days: number;
  auto_pull_on_start: boolean;
}

const DEFAULT_CONFIG: StateSyncConfig = {
  lock_timeout_days: 5,
  auto_pull_on_start: true,
};

export class StateBranchService {
  private mark2Dir: string;
  private projectRoot: string;
  private stateDir: string;
  private branchName = 'mark2-state';
  private config: StateSyncConfig;
  private localOnly: boolean;

  /**
   * @param mark2Dir - The .mark2 directory path
   * @param localOnly - If true, skip git operations and write directly to mark2Dir (for testing)
   */
  constructor(mark2Dir?: string, localOnly: boolean = false) {
    this.mark2Dir = mark2Dir ?? getMark2Dir();
    this.projectRoot = path.dirname(this.mark2Dir);
    this.localOnly = localOnly;
    // In local-only mode, write directly to mark2Dir; otherwise use .state worktree
    this.stateDir = localOnly ? this.mark2Dir : path.join(this.mark2Dir, '.state');
    this.config = this.loadConfig();
  }

  private loadConfig(): StateSyncConfig {
    try {
      const configPath = path.join(this.mark2Dir, 'config.yaml');
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const parsed = YAML.parse(content);
        return {
          ...DEFAULT_CONFIG,
          ...parsed.state_sync,
        };
      }
    } catch {
      // Use defaults
    }
    return DEFAULT_CONFIG;
  }

  /**
   * Get git config value (user.name or user.email)
   */
  private getGitConfig(key: string): string {
    try {
      return execSync(`git config ${key}`, {
        cwd: this.projectRoot,
        encoding: 'utf-8',
      }).trim();
    } catch {
      return '';
    }
  }

  /**
   * Get current user identity from git config
   */
  getUserIdentity(): { name: string; email: string; machine: string } {
    const name = this.getGitConfig('user.name') || 'Unknown';
    const email = this.getGitConfig('user.email') || 'unknown@localhost';
    const machine = os.hostname();
    return { name, email, machine };
  }

  /**
   * Check if the orphan branch exists (locally or remotely)
   */
  branchExists(): boolean {
    try {
      // Check local branches
      const localResult = spawnSync('git', ['branch', '--list', this.branchName], {
        cwd: this.projectRoot,
        encoding: 'utf-8',
      });
      if (localResult.stdout.trim()) {
        return true;
      }

      // Check remote branches
      const remoteResult = spawnSync('git', ['branch', '-r', '--list', `origin/${this.branchName}`], {
        cwd: this.projectRoot,
        encoding: 'utf-8',
      });
      return !!remoteResult.stdout.trim();
    } catch {
      return false;
    }
  }

  /**
   * Check if the state worktree exists
   */
  worktreeExists(): boolean {
    return fs.existsSync(this.stateDir) && fs.existsSync(path.join(this.stateDir, '.git'));
  }

  /**
   * Check if there's a remote configured
   */
  hasRemote(): boolean {
    try {
      const result = spawnSync('git', ['remote', 'get-url', 'origin'], {
        cwd: this.projectRoot,
        encoding: 'utf-8',
      });
      return result.status === 0 && !!result.stdout.trim();
    } catch {
      return false;
    }
  }

  /**
   * Initialize the orphan branch if it doesn't exist
   */
  async init(): Promise<void> {
    if (this.branchExists()) {
      console.log(`   · Orphan branch '${this.branchName}' already exists`);
      return;
    }

    console.log(`   ✓ Creating orphan branch '${this.branchName}'...`);

    // Create a temporary directory to set up the orphan branch
    const tmpDir = path.join(this.mark2Dir, '.tmp-state-init');
    try {
      // Clean up any existing tmp dir
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true });
      }
      fs.mkdirSync(tmpDir, { recursive: true });

      // Initialize a new git repo in the temp dir
      execSync('git init', { cwd: tmpDir, stdio: 'pipe' });

      // Create initial directory structure
      const dirs = ['tasks', 'stories'];
      for (const dir of dirs) {
        fs.mkdirSync(path.join(tmpDir, dir), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, dir, '.gitkeep'), '');
      }

      // Copy config files if they exist in .mark2
      const configFiles = ['config.yaml', 'agents.yaml', 'context.json', 'roles.yaml'];
      for (const file of configFiles) {
        const src = path.join(this.mark2Dir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(tmpDir, file));
        }
      }

      // Git config for the commit
      const { name, email } = this.getUserIdentity();
      execSync(`git config user.name "${name}"`, { cwd: tmpDir, stdio: 'pipe' });
      execSync(`git config user.email "${email}"`, { cwd: tmpDir, stdio: 'pipe' });

      // Create the initial commit
      execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git commit -m "Initialize mark2 state branch"', { cwd: tmpDir, stdio: 'pipe' });

      // Create orphan branch in main repo by fetching from the tmp repo
      execSync(`git fetch "${tmpDir}" HEAD:${this.branchName}`, {
        cwd: this.projectRoot,
        stdio: 'pipe',
      });

      // Push to remote if available
      if (this.hasRemote()) {
        try {
          await execAsync(`git push -u origin ${this.branchName}`, {
            cwd: this.projectRoot,
          });
        } catch (e) {
          console.log(`   ⚠ Could not push to remote (may need to push manually)`);
        }
      }
    } finally {
      // Clean up tmp dir
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true });
      }
    }
  }

  /**
   * Ensure the .state/ worktree exists and is checked out to the orphan branch
   */
  async ensureWorktree(): Promise<void> {
    // In local-only mode, just ensure the directory exists
    if (this.localOnly) {
      if (!fs.existsSync(this.stateDir)) {
        fs.mkdirSync(this.stateDir, { recursive: true });
      }
      return;
    }

    if (this.worktreeExists()) {
      return;
    }

    // Make sure the branch exists first
    if (!this.branchExists()) {
      await this.init();
    }

    console.log(`   ✓ Setting up .state/ worktree...`);

    // Remove any stale worktree reference
    try {
      execSync(`git worktree remove "${this.stateDir}" --force`, {
        cwd: this.projectRoot,
        stdio: 'pipe',
      });
    } catch {
      // Ignore if worktree doesn't exist
    }

    // Clean up directory if it exists but isn't a proper worktree
    if (fs.existsSync(this.stateDir)) {
      fs.rmSync(this.stateDir, { recursive: true });
    }

    // Add the worktree
    execSync(`git worktree add "${this.stateDir}" ${this.branchName}`, {
      cwd: this.projectRoot,
      stdio: 'pipe',
    });
  }

  /**
   * Pull latest changes from remote
   */
  async pull(): Promise<SyncResult> {
    // In local-only mode, no remote operations
    if (this.localOnly) {
      return { success: true, updated: false, message: 'Local-only mode' };
    }

    await this.ensureWorktree();

    if (!this.hasRemote()) {
      return { success: true, updated: false, message: 'No remote configured' };
    }

    try {
      // Fetch latest
      await execAsync('git fetch origin', { cwd: this.stateDir });

      // Check if we have updates
      const localHead = execSync('git rev-parse HEAD', { cwd: this.stateDir, encoding: 'utf-8' }).trim();

      let remoteHead: string;
      try {
        remoteHead = execSync(`git rev-parse origin/${this.branchName}`, {
          cwd: this.stateDir,
          encoding: 'utf-8'
        }).trim();
      } catch {
        // Remote branch doesn't exist yet
        return { success: true, updated: false, message: 'Remote branch not yet pushed' };
      }

      if (localHead === remoteHead) {
        return { success: true, updated: false, message: 'Already up to date' };
      }

      // Try to merge
      try {
        execSync(`git merge origin/${this.branchName} --ff-only`, {
          cwd: this.stateDir,
          stdio: 'pipe',
        });
        return { success: true, updated: true, message: 'Updated from remote' };
      } catch {
        // Fast-forward failed, try regular merge
        try {
          execSync(`git merge origin/${this.branchName} -m "Merge remote state"`, {
            cwd: this.stateDir,
            stdio: 'pipe',
          });
          return { success: true, updated: true, message: 'Merged from remote' };
        } catch (e: any) {
          // Merge conflict
          const conflicts = this.getConflictedFiles();
          // Abort the merge
          execSync('git merge --abort', { cwd: this.stateDir, stdio: 'pipe' });
          return {
            success: false,
            updated: false,
            message: 'Merge conflict - manual resolution required',
            conflicts,
          };
        }
      }
    } catch (e: any) {
      return { success: false, updated: false, message: e.message || 'Pull failed' };
    }
  }

  private getConflictedFiles(): string[] {
    try {
      const result = execSync('git diff --name-only --diff-filter=U', {
        cwd: this.stateDir,
        encoding: 'utf-8',
      });
      return result.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Commit and push local changes
   */
  async push(message: string): Promise<void> {
    // In local-only mode, no remote operations
    if (this.localOnly) {
      return;
    }

    await this.ensureWorktree();

    // Stage all changes
    execSync('git add -A', { cwd: this.stateDir, stdio: 'pipe' });

    // Check if there are changes to commit
    const status = execSync('git status --porcelain', { cwd: this.stateDir, encoding: 'utf-8' });
    if (!status.trim()) {
      return; // Nothing to commit
    }

    // Commit
    const { name, email } = this.getUserIdentity();
    execSync(`git -c user.name="${name}" -c user.email="${email}" commit -m "${message.replace(/"/g, '\\"')}"`, {
      cwd: this.stateDir,
      stdio: 'pipe',
    });

    // Push if remote exists
    if (this.hasRemote()) {
      await execAsync(`git push origin ${this.branchName}`, {
        cwd: this.stateDir,
      });
    }
  }

  // ── Lock Operations ────────────────────────────────────────────────────

  /**
   * Get the lock file path for a task
   */
  private getLockPath(taskId: string): string {
    return path.join(this.stateDir, 'tasks', `${taskId}.lock`);
  }

  /**
   * Acquire a lock for a task
   */
  async acquireLock(taskId: string): Promise<LockResult> {
    await this.ensureWorktree();

    // Pull latest to check for existing locks
    const pullResult = await this.pull();
    if (!pullResult.success && pullResult.conflicts) {
      return { success: false, error: 'Sync conflict - resolve before acquiring lock' };
    }

    const lockPath = this.getLockPath(taskId);
    const existingLock = await this.getLock(taskId);

    if (existingLock) {
      // Check if it's our lock
      if (await this.isLockMine(existingLock)) {
        return { success: true, lock: existingLock };
      }

      // Check if expired
      if (await this.isLockExpired(existingLock)) {
        // Force take the lock
        return this.forceTakeLock(taskId);
      }

      return {
        success: false,
        error: `Task is locked by ${existingLock.locked_by}`,
        existingLock,
      };
    }

    // Create the lock
    const { name, email, machine } = this.getUserIdentity();
    const lock: LockInfo = {
      locked_by: name,
      email,
      locked_at: new Date().toISOString(),
      machine,
    };

    // Ensure directory exists
    const lockDir = path.dirname(lockPath);
    if (!fs.existsSync(lockDir)) {
      fs.mkdirSync(lockDir, { recursive: true });
    }

    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));

    // Push the lock
    try {
      await this.push(`Lock ${taskId}`);
      return { success: true, lock };
    } catch (e: any) {
      // Failed to push, remove local lock
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
      return { success: false, error: `Failed to acquire lock: ${e.message}` };
    }
  }

  /**
   * Release a lock for a task
   */
  async releaseLock(taskId: string): Promise<void> {
    await this.ensureWorktree();

    const lockPath = this.getLockPath(taskId);
    if (!fs.existsSync(lockPath)) {
      return; // No lock to release
    }

    fs.unlinkSync(lockPath);
    await this.push(`Release ${taskId}`);
  }

  /**
   * Get lock info for a task
   */
  async getLock(taskId: string): Promise<LockInfo | null> {
    await this.ensureWorktree();

    const lockPath = this.getLockPath(taskId);
    if (!fs.existsSync(lockPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(lockPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Check if a lock is expired based on lock_timeout_days config
   */
  async isLockExpired(lock: LockInfo): Promise<boolean> {
    const lockTime = new Date(lock.locked_at).getTime();
    const now = Date.now();
    const timeoutMs = this.config.lock_timeout_days * 24 * 60 * 60 * 1000;
    return now - lockTime > timeoutMs;
  }

  /**
   * Check if a lock belongs to the current user
   */
  async isLockMine(lock: LockInfo): Promise<boolean> {
    const { email } = this.getUserIdentity();
    return lock.email === email;
  }

  /**
   * Force take a lock (for expired locks)
   */
  async forceTakeLock(taskId: string): Promise<LockResult> {
    await this.ensureWorktree();

    const lockPath = this.getLockPath(taskId);
    const { name, email, machine } = this.getUserIdentity();

    const lock: LockInfo = {
      locked_by: name,
      email,
      locked_at: new Date().toISOString(),
      machine,
    };

    // Ensure directory exists
    const lockDir = path.dirname(lockPath);
    if (!fs.existsSync(lockDir)) {
      fs.mkdirSync(lockDir, { recursive: true });
    }

    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));

    try {
      await this.push(`Force acquire lock on ${taskId}`);
      return { success: true, lock };
    } catch (e: any) {
      return { success: false, error: `Failed to force acquire lock: ${e.message}` };
    }
  }

  /**
   * List all current locks
   */
  async listLocks(): Promise<Map<string, LockInfo>> {
    await this.ensureWorktree();

    const locks = new Map<string, LockInfo>();
    const tasksDir = path.join(this.stateDir, 'tasks');

    if (!fs.existsSync(tasksDir)) {
      return locks;
    }

    const files = fs.readdirSync(tasksDir).filter(f => f.endsWith('.lock'));
    for (const file of files) {
      const taskId = file.replace('.lock', '');
      try {
        const content = fs.readFileSync(path.join(tasksDir, file), 'utf-8');
        locks.set(taskId, JSON.parse(content));
      } catch {
        // Skip invalid lock files
      }
    }

    return locks;
  }

  // ── File Operations ────────────────────────────────────────────────────

  /**
   * Get the state directory path
   */
  getStateDir(): string {
    return this.stateDir;
  }

  /**
   * Read a YAML file from the state directory
   */
  async readYaml<T>(relativePath: string): Promise<T | null> {
    await this.ensureWorktree();

    const filePath = path.join(this.stateDir, relativePath);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return YAML.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Write a YAML file to the state directory (atomic write)
   */
  async writeYaml(relativePath: string, data: any): Promise<void> {
    await this.ensureWorktree();

    const filePath = path.join(this.stateDir, relativePath);
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const content = YAML.stringify(data, { lineWidth: 0 });
    // Atomic write
    const tmpPath = path.join(dir, `.tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, filePath);
  }

  /**
   * Delete a file from the state directory
   */
  async deleteFile(relativePath: string): Promise<void> {
    await this.ensureWorktree();

    const filePath = path.join(this.stateDir, relativePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * List files in a directory matching a pattern
   */
  async listFiles(dir: string, pattern: RegExp): Promise<string[]> {
    await this.ensureWorktree();

    const dirPath = path.join(this.stateDir, dir);
    if (!fs.existsSync(dirPath)) {
      return [];
    }

    return fs.readdirSync(dirPath).filter(f => pattern.test(f));
  }

  /**
   * Check if a file exists in the state directory
   */
  async fileExists(relativePath: string): Promise<boolean> {
    await this.ensureWorktree();
    return fs.existsSync(path.join(this.stateDir, relativePath));
  }

  // ── Migration ──────────────────────────────────────────────────────────

  /**
   * Migrate existing .mark2/ content to the orphan branch
   */
  async migrateExisting(): Promise<{ migrated: boolean; files: string[] }> {
    const migratedFiles: string[] = [];

    // Check if there's existing state to migrate
    const tasksDir = path.join(this.mark2Dir, 'tasks');
    const storiesDir = path.join(this.mark2Dir, 'stories');

    const hasExistingTasks = fs.existsSync(tasksDir) &&
      fs.readdirSync(tasksDir).some(f => f.endsWith('.yaml'));
    const hasExistingStories = fs.existsSync(storiesDir) &&
      fs.readdirSync(storiesDir).some(f => f.endsWith('.yaml'));

    if (!hasExistingTasks && !hasExistingStories) {
      return { migrated: false, files: [] };
    }

    // Ensure worktree exists
    await this.ensureWorktree();

    // Migrate tasks
    if (hasExistingTasks) {
      const files = fs.readdirSync(tasksDir).filter(f => f.endsWith('.yaml'));
      for (const file of files) {
        const src = path.join(tasksDir, file);
        const dest = path.join(this.stateDir, 'tasks', file);

        // Ensure destination directory exists
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        // Copy file (don't move, keep original until migration is verified)
        fs.copyFileSync(src, dest);
        migratedFiles.push(`tasks/${file}`);
      }
    }

    // Migrate stories
    if (hasExistingStories) {
      const files = fs.readdirSync(storiesDir).filter(f => f.endsWith('.yaml'));
      for (const file of files) {
        const src = path.join(storiesDir, file);
        const dest = path.join(this.stateDir, 'stories', file);

        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        fs.copyFileSync(src, dest);
        migratedFiles.push(`stories/${file}`);
      }
    }

    // Migrate config files
    const configFiles = ['config.yaml', 'agents.yaml', 'context.json', 'roles.yaml'];
    for (const file of configFiles) {
      const src = path.join(this.mark2Dir, file);
      if (fs.existsSync(src)) {
        const dest = path.join(this.stateDir, file);
        fs.copyFileSync(src, dest);
        migratedFiles.push(file);
      }
    }

    // Commit the migrated files
    if (migratedFiles.length > 0) {
      await this.push('Migrate existing state from .mark2/');
    }

    return { migrated: true, files: migratedFiles };
  }

  /**
   * Clean up old state files from .mark2/ after successful migration
   * Only call this after verifying the migration worked
   */
  async cleanupAfterMigration(): Promise<void> {
    const tasksDir = path.join(this.mark2Dir, 'tasks');
    const storiesDir = path.join(this.mark2Dir, 'stories');

    // Remove YAML files from tasks directory (keep the directory)
    if (fs.existsSync(tasksDir)) {
      const files = fs.readdirSync(tasksDir).filter(f => f.endsWith('.yaml'));
      for (const file of files) {
        fs.unlinkSync(path.join(tasksDir, file));
      }
    }

    // Remove YAML files from stories directory (keep the directory)
    if (fs.existsSync(storiesDir)) {
      const files = fs.readdirSync(storiesDir).filter(f => f.endsWith('.yaml'));
      for (const file of files) {
        fs.unlinkSync(path.join(storiesDir, file));
      }
    }

    // Note: config files stay in .mark2/ for backwards compatibility,
    // but the canonical source is now the orphan branch
  }
}
