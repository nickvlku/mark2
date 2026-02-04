import { getDb } from '../db';
import { tasks, activityEntries, agentSessions } from '../db/schema';
import { TaskSchema, Phase } from '../yaml/schemas';
import type { Task, TaskPhaseOverride } from '../yaml/schemas';
import { generateTaskId } from '../utils/id-generator';
import { ensureTaskStorageExistsSync, getTaskStoragePaths } from '../utils/storage';
import { eq, and, sql, desc } from 'drizzle-orm';
import { isSessionAlive } from '../utils/tmux';
import { getMark2Dir } from '../utils/mark2-dir';
import { StateBranchService, LockInfo } from './state-branch-service';
import fs from 'fs';
import path from 'path';

export type SessionStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface TaskWithSession extends Task {
  session_status: SessionStatus;
}

export interface TaskWithLock extends Task {
  lock?: LockInfo;
}

export interface TaskWithSessionAndLock extends TaskWithSession {
  lock?: LockInfo;
}

export class TaskService {
  private mark2Dir: string;
  private stateBranch: StateBranchService;

  /**
   * @param mark2Dir - The .mark2 directory path
   * @param stateBranch - Optional StateBranchService instance
   * @param localOnly - If true, skip git operations (for testing)
   */
  constructor(mark2Dir?: string, stateBranch?: StateBranchService, localOnly: boolean = false) {
    this.mark2Dir = mark2Dir ?? getMark2Dir();
    this.stateBranch = stateBranch ?? new StateBranchService(this.mark2Dir, localOnly);
  }

  async create(data: {
    title: string;
    description: string;
    priority?: string;
    blockers?: string[];
    /** @deprecated Use phase_overrides instead */
    phase_agents?: Record<string, string>;
    phase_overrides?: Record<string, TaskPhaseOverride>;
    story_id?: string;
    parent_task?: string;
    created_by: string;
  }): Promise<Task> {
    const now = new Date().toISOString();
    const id = generateTaskId(this.mark2Dir);

    const task = TaskSchema.parse({
      id,
      title: data.title,
      description: data.description,
      phase: 'pending',
      priority: data.priority ?? 'P2',
      blockers: data.blockers ?? [],
      phase_agents: data.phase_agents ?? {},
      phase_overrides: data.phase_overrides ?? {},
      story_id: data.story_id,
      parent_task: data.parent_task,
      created_by: data.created_by,
      artifacts: [],
      ports: [],
      worktrees: {},
      merge_strategy: 'squash',
      created_at: now,
      updated_at: now,
      phase_entered_at: now,
      loop_count: 0,
      archived: false,
    });

    // Write to state branch
    await this.stateBranch.writeYaml(`tasks/${task.id}.yaml`, task);

    // Initialize storage directories for the task
    const projectRoot = path.dirname(this.mark2Dir);
    ensureTaskStorageExistsSync(projectRoot, task.id);

    // Update SQLite (index)
    const db = getDb(this.mark2Dir);
    db.insert(tasks).values({
      id: task.id,
      title: task.title,
      description: task.description,
      phase: task.phase,
      priority: task.priority,
      story_id: task.story_id ?? null,
      parent_task: task.parent_task ?? null,
      created_by: task.created_by,
      merge_strategy: task.merge_strategy,
      auto_advance: task.auto_advance,
      auto_approve: task.auto_approve,
      created_at: task.created_at,
      updated_at: task.updated_at,
      phase_entered_at: task.phase_entered_at,
      loop_count: task.loop_count,
      archived: task.archived,
      archived_at: task.archived_at ?? null,
      phase_agents_json: JSON.stringify(task.phase_agents),
      phase_overrides_json: JSON.stringify(task.phase_overrides),
      blockers_json: JSON.stringify(task.blockers),
      artifacts_json: JSON.stringify(task.artifacts),
      ports_json: JSON.stringify(task.ports),
      worktrees_json: JSON.stringify(task.worktrees),
    }).run();

    // Initialize activity log
    await this.stateBranch.writeYaml(`tasks/${task.id}.activity.yaml`, { task_id: task.id, entries: [] });

    // Push to remote
    await this.stateBranch.push(`Create ${task.id}: ${task.title}`);

    return task;
  }

  // Synchronous version for backwards compatibility (uses cached DB data)
  createSync(data: {
    title: string;
    description: string;
    priority?: string;
    blockers?: string[];
    phase_agents?: Record<string, string>;
    phase_overrides?: Record<string, TaskPhaseOverride>;
    story_id?: string;
    parent_task?: string;
    created_by: string;
  }): Task {
    const now = new Date().toISOString();
    const id = generateTaskId(this.mark2Dir);

    const task = TaskSchema.parse({
      id,
      title: data.title,
      description: data.description,
      phase: 'pending',
      priority: data.priority ?? 'P2',
      blockers: data.blockers ?? [],
      phase_agents: data.phase_agents ?? {},
      phase_overrides: data.phase_overrides ?? {},
      story_id: data.story_id,
      parent_task: data.parent_task,
      created_by: data.created_by,
      artifacts: [],
      ports: [],
      worktrees: {},
      merge_strategy: 'squash',
      created_at: now,
      updated_at: now,
      phase_entered_at: now,
      loop_count: 0,
      archived: false,
    });

    // Write to state branch (fire and forget for sync version)
    this.stateBranch.writeYaml(`tasks/${task.id}.yaml`, task).then(() => {
      this.stateBranch.writeYaml(`tasks/${task.id}.activity.yaml`, { task_id: task.id, entries: [] });
      this.stateBranch.push(`Create ${task.id}: ${task.title}`).catch(() => {});
    }).catch(() => {});

    // Initialize storage directories for the task
    const projectRoot = path.dirname(this.mark2Dir);
    ensureTaskStorageExistsSync(projectRoot, task.id);

    // Update SQLite (index)
    const db = getDb(this.mark2Dir);
    db.insert(tasks).values({
      id: task.id,
      title: task.title,
      description: task.description,
      phase: task.phase,
      priority: task.priority,
      story_id: task.story_id ?? null,
      parent_task: task.parent_task ?? null,
      created_by: task.created_by,
      merge_strategy: task.merge_strategy,
      auto_advance: task.auto_advance,
      auto_approve: task.auto_approve,
      created_at: task.created_at,
      updated_at: task.updated_at,
      phase_entered_at: task.phase_entered_at,
      loop_count: task.loop_count,
      archived: task.archived,
      archived_at: task.archived_at ?? null,
      phase_agents_json: JSON.stringify(task.phase_agents),
      phase_overrides_json: JSON.stringify(task.phase_overrides),
      blockers_json: JSON.stringify(task.blockers),
      artifacts_json: JSON.stringify(task.artifacts),
      ports_json: JSON.stringify(task.ports),
      worktrees_json: JSON.stringify(task.worktrees),
    }).run();

    return task;
  }

  getById(taskId: string): Task | null {
    const db = getDb(this.mark2Dir);
    const row = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
    if (!row) return null;
    return this.rowToTask(row);
  }

  list(filters?: {
    phase?: string;
    priority?: string;
    story_id?: string;
    blocked?: boolean;
    archived?: boolean;
  }): Task[] {
    const db = getDb(this.mark2Dir);
    const conditions: ReturnType<typeof eq>[] = [];

    if (filters?.phase) {
      conditions.push(eq(tasks.phase, filters.phase));
    }
    if (filters?.priority) {
      conditions.push(eq(tasks.priority, filters.priority));
    }
    if (filters?.story_id) {
      conditions.push(eq(tasks.story_id, filters.story_id));
    }

    // Default to showing only non-archived tasks
    const showArchived = filters?.archived ?? false;
    if (showArchived) {
      conditions.push(eq(tasks.archived, true));
    } else {
      conditions.push(eq(tasks.archived, false));
    }

    let rows;
    if (conditions.length > 0) {
      rows = db.select().from(tasks).where(and(...conditions)).all();
    } else {
      rows = db.select().from(tasks).all();
    }

    let result = rows.map((row) => this.rowToTask(row));

    if (filters?.blocked !== undefined) {
      result = result.filter((t) => {
        const hasBlockers = t.blockers.length > 0;
        return filters.blocked ? hasBlockers : !hasBlockers;
      });
    }

    return result;
  }

  async update(taskId: string, updates: Partial<Task>): Promise<Task> {
    const existing = this.getById(taskId);
    if (!existing) {
      throw new Error(`Task ${taskId} not found`);
    }

    const now = new Date().toISOString();
    const merged = {
      ...existing,
      ...updates,
      id: taskId, // Prevent ID change
      updated_at: now,
    };

    const task = TaskSchema.parse(merged);

    // Write to state branch
    await this.stateBranch.writeYaml(`tasks/${task.id}.yaml`, task);

    // Update SQLite
    const db = getDb(this.mark2Dir);
    db.update(tasks)
      .set({
        title: task.title,
        description: task.description,
        phase: task.phase,
        priority: task.priority,
        story_id: task.story_id ?? null,
        parent_task: task.parent_task ?? null,
        created_by: task.created_by,
        merge_strategy: task.merge_strategy,
        auto_advance: task.auto_advance,
        auto_approve: task.auto_approve,
        created_at: task.created_at,
        updated_at: task.updated_at,
        phase_entered_at: task.phase_entered_at,
        loop_count: task.loop_count,
        archived: task.archived,
        archived_at: task.archived_at ?? null,
        phase_agents_json: JSON.stringify(task.phase_agents),
        phase_overrides_json: JSON.stringify(task.phase_overrides),
        blockers_json: JSON.stringify(task.blockers),
        artifacts_json: JSON.stringify(task.artifacts),
        ports_json: JSON.stringify(task.ports),
        worktrees_json: JSON.stringify(task.worktrees),
      })
      .where(eq(tasks.id, taskId))
      .run();

    return task;
  }

  // Synchronous update for backwards compatibility
  updateSync(taskId: string, updates: Partial<Task>): Task {
    const existing = this.getById(taskId);
    if (!existing) {
      throw new Error(`Task ${taskId} not found`);
    }

    const now = new Date().toISOString();
    const merged = {
      ...existing,
      ...updates,
      id: taskId,
      updated_at: now,
    };

    const task = TaskSchema.parse(merged);

    // Write to state branch (fire and forget)
    this.stateBranch.writeYaml(`tasks/${task.id}.yaml`, task).catch(() => {});

    // Update SQLite
    const db = getDb(this.mark2Dir);
    db.update(tasks)
      .set({
        title: task.title,
        description: task.description,
        phase: task.phase,
        priority: task.priority,
        story_id: task.story_id ?? null,
        parent_task: task.parent_task ?? null,
        created_by: task.created_by,
        merge_strategy: task.merge_strategy,
        auto_advance: task.auto_advance,
        auto_approve: task.auto_approve,
        created_at: task.created_at,
        updated_at: task.updated_at,
        phase_entered_at: task.phase_entered_at,
        loop_count: task.loop_count,
        archived: task.archived,
        archived_at: task.archived_at ?? null,
        phase_agents_json: JSON.stringify(task.phase_agents),
        phase_overrides_json: JSON.stringify(task.phase_overrides),
        blockers_json: JSON.stringify(task.blockers),
        artifacts_json: JSON.stringify(task.artifacts),
        ports_json: JSON.stringify(task.ports),
        worktrees_json: JSON.stringify(task.worktrees),
      })
      .where(eq(tasks.id, taskId))
      .run();

    return task;
  }

  async delete(taskId: string): Promise<void> {
    const task = this.getById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    if (!task.archived) {
      throw new Error(`Task ${taskId} must be archived before deletion`);
    }

    // Delete from state branch
    await this.stateBranch.deleteFile(`tasks/${taskId}.yaml`);
    await this.stateBranch.deleteFile(`tasks/${taskId}.activity.yaml`);
    await this.stateBranch.deleteFile(`tasks/${taskId}.lock`);
    await this.stateBranch.push(`Delete ${taskId}`);

    // Delete from SQLite
    const db = getDb(this.mark2Dir);
    db.delete(tasks).where(eq(tasks.id, taskId)).run();
    db.delete(activityEntries).where(eq(activityEntries.task_id, taskId)).run();
  }

  async archive(taskId: string): Promise<Task> {
    const existing = this.getById(taskId);
    if (!existing) {
      throw new Error(`Task ${taskId} not found`);
    }

    const now = new Date().toISOString();
    const task = await this.update(taskId, {
      archived: true,
      archived_at: now,
    });

    // Release any lock when archiving
    await this.stateBranch.releaseLock(taskId);
    await this.stateBranch.push(`Archive ${taskId}`);

    return task;
  }

  async restore(taskId: string): Promise<Task> {
    const existing = this.getById(taskId);
    if (!existing) {
      throw new Error(`Task ${taskId} not found`);
    }

    const task = await this.update(taskId, {
      archived: false,
      archived_at: undefined,
    });

    await this.stateBranch.push(`Restore ${taskId}`);

    return task;
  }

  async addBlocker(taskId: string, blockerId: string): Promise<Task> {
    const task = this.getById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    if (task.blockers.includes(blockerId)) {
      return task; // Already exists
    }
    const updated = await this.update(taskId, {
      blockers: [...task.blockers, blockerId],
    });
    await this.stateBranch.push(`Add blocker ${blockerId} to ${taskId}`);
    return updated;
  }

  async removeBlocker(taskId: string, blockerId: string): Promise<Task> {
    const task = this.getById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    const updated = await this.update(taskId, {
      blockers: task.blockers.filter((b) => b !== blockerId),
    });
    await this.stateBranch.push(`Remove blocker ${blockerId} from ${taskId}`);
    return updated;
  }

  /**
   * Transition a task to a new phase.
   * Handles lock acquisition when moving from pending to design.
   * Handles lock release when moving to done.
   */
  async transitionPhase(taskId: string, newPhase: string): Promise<Task> {
    const parsed = Phase.parse(newPhase);
    const task = this.getById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const oldPhase = task.phase;

    // Lock acquisition: pending → design (first work phase)
    if (oldPhase === 'pending' && parsed === 'design') {
      const lockResult = await this.stateBranch.acquireLock(taskId);
      if (!lockResult.success) {
        if (lockResult.existingLock) {
          throw new Error(
            `Task is locked by ${lockResult.existingLock.locked_by} (${lockResult.existingLock.email}) since ${new Date(lockResult.existingLock.locked_at).toLocaleDateString()}`
          );
        }
        throw new Error(lockResult.error || 'Failed to acquire lock');
      }
    }

    // Lock release: → done
    if (parsed === 'done') {
      await this.stateBranch.releaseLock(taskId);
    }

    const now = new Date().toISOString();
    const updated = await this.update(taskId, {
      phase: parsed,
      phase_entered_at: now,
    });

    // Log activity
    const db = getDb(this.mark2Dir);
    db.insert(activityEntries).values({
      task_id: taskId,
      timestamp: now,
      source: 'system',
      type: 'phase_change',
      message: `Phase transitioned from ${oldPhase} to ${parsed}`,
      metadata_json: JSON.stringify({ old_phase: oldPhase, new_phase: parsed }),
    }).run();

    // Also update activity YAML
    const activityData = await this.stateBranch.readYaml<{ task_id: string; entries: any[] }>(`tasks/${taskId}.activity.yaml`);
    const entries = activityData?.entries ?? [];
    entries.push({
      timestamp: now,
      source: 'system',
      type: 'phase_change',
      message: `Phase transitioned from ${oldPhase} to ${parsed}`,
      metadata: { old_phase: oldPhase, new_phase: parsed },
    });
    await this.stateBranch.writeYaml(`tasks/${taskId}.activity.yaml`, { task_id: taskId, entries });

    // Push the phase transition
    await this.stateBranch.push(`${taskId}: ${oldPhase} → ${parsed}`);

    return updated;
  }

  // Synchronous version that doesn't handle locks (for internal use)
  transitionPhaseSync(taskId: string, newPhase: string): Task {
    const parsed = Phase.parse(newPhase);
    const task = this.getById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const now = new Date().toISOString();
    const oldPhase = task.phase;

    const updated = this.updateSync(taskId, {
      phase: parsed,
      phase_entered_at: now,
    });

    // Log activity
    const db = getDb(this.mark2Dir);
    db.insert(activityEntries).values({
      task_id: taskId,
      timestamp: now,
      source: 'system',
      type: 'phase_change',
      message: `Phase transitioned from ${oldPhase} to ${parsed}`,
      metadata_json: JSON.stringify({ old_phase: oldPhase, new_phase: parsed }),
    }).run();

    return updated;
  }

  allBlockersResolved(taskId: string): boolean {
    const task = this.getById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    if (task.blockers.length === 0) return true;

    const db = getDb(this.mark2Dir);
    for (const blockerId of task.blockers) {
      const blocker = db.select().from(tasks).where(eq(tasks.id, blockerId)).get();
      if (!blocker || blocker.phase !== 'done') {
        return false;
      }
    }
    return true;
  }

  /**
   * Get lock info for a task
   */
  async getLock(taskId: string): Promise<LockInfo | null> {
    return this.stateBranch.getLock(taskId);
  }

  /**
   * Check if a task can be picked up by the current user
   */
  async canPickUp(taskId: string): Promise<{ canPickUp: boolean; reason?: string; lock?: LockInfo }> {
    const lock = await this.stateBranch.getLock(taskId);

    if (!lock) {
      return { canPickUp: true };
    }

    if (await this.stateBranch.isLockMine(lock)) {
      return { canPickUp: true, lock };
    }

    if (await this.stateBranch.isLockExpired(lock)) {
      return { canPickUp: true, reason: 'Lock expired', lock };
    }

    return {
      canPickUp: false,
      reason: `Locked by ${lock.locked_by} since ${new Date(lock.locked_at).toLocaleDateString()}`,
      lock,
    };
  }

  /**
   * Force acquire a lock on a task (for expired locks)
   */
  async forceAcquireLock(taskId: string): Promise<{ success: boolean; error?: string }> {
    const lock = await this.stateBranch.getLock(taskId);

    if (!lock) {
      // No lock, just acquire normally
      const result = await this.stateBranch.acquireLock(taskId);
      return { success: result.success, error: result.error };
    }

    if (await this.stateBranch.isLockMine(lock)) {
      return { success: true }; // Already ours
    }

    if (!(await this.stateBranch.isLockExpired(lock))) {
      return { success: false, error: 'Lock is not expired' };
    }

    const result = await this.stateBranch.forceTakeLock(taskId);
    return { success: result.success, error: result.error };
  }

  /**
   * Get the current session status for a task.
   * Checks the agent_sessions table. DB status takes precedence over tmux state
   * because the session may still be alive even after the agent completed.
   */
  async getSessionStatus(taskId: string): Promise<SessionStatus> {
    const db = getDb(this.mark2Dir);

    // Get most recent session for this task
    const row = db
      .select({
        tmux_session: agentSessions.tmux_session,
        status: agentSessions.status,
      })
      .from(agentSessions)
      .where(eq(agentSessions.task_id, taskId))
      .orderBy(desc(agentSessions.started_at))
      .limit(1)
      .get();

    if (!row) {
      return 'idle';
    }

    // DB status takes precedence
    if (row.status === 'completed') {
      return 'completed';
    }
    if (row.status === 'failed') {
      return 'failed';
    }

    // For 'running' status, verify the tmux session is actually alive
    if (row.status === 'running') {
      try {
        const alive = await isSessionAlive(row.tmux_session);
        if (alive) {
          return 'running';
        }
        // Tmux died but DB still says running - it crashed
        return 'failed';
      } catch {
        return 'failed';
      }
    }

    return 'idle';
  }

  /**
   * List tasks with session status included.
   */
  async listWithStatus(filters?: {
    phase?: string;
    priority?: string;
    story_id?: string;
    blocked?: boolean;
    archived?: boolean;
  }): Promise<TaskWithSession[]> {
    const taskList = this.list(filters);

    // Get session status for each task
    const results: TaskWithSession[] = [];
    for (const task of taskList) {
      const session_status = await this.getSessionStatus(task.id);
      results.push({ ...task, session_status });
    }

    return results;
  }

  /**
   * List tasks with session status and lock info included.
   */
  async listWithStatusAndLocks(filters?: {
    phase?: string;
    priority?: string;
    story_id?: string;
    blocked?: boolean;
    archived?: boolean;
  }): Promise<TaskWithSessionAndLock[]> {
    const taskList = this.list(filters);
    const locks = await this.stateBranch.listLocks();

    const results: TaskWithSessionAndLock[] = [];
    for (const task of taskList) {
      const session_status = await this.getSessionStatus(task.id);
      const lock = locks.get(task.id);
      results.push({ ...task, session_status, lock });
    }

    return results;
  }

  /**
   * Auto-detect and register artifacts from the storage directory.
   * This ensures artifacts are registered even if the agent forgot to call the API.
   */
  syncArtifactsFromStorage(taskId: string): void {
    const projectRoot = path.dirname(this.mark2Dir);
    const storagePaths = getTaskStoragePaths(projectRoot, taskId);

    if (!fs.existsSync(storagePaths.artifacts)) {
      return;
    }

    const task = this.getById(taskId);
    if (!task) return;

    const existingPaths = new Set(task.artifacts.map(a => a.path));
    const files = fs.readdirSync(storagePaths.artifacts);
    const now = new Date().toISOString();
    let updated = false;

    for (const file of files) {
      if (existingPaths.has(file)) continue;

      // Determine phase and name from filename
      const baseName = file.replace(/\.[^/.]+$/, '');
      let phase: Task['phase'] = task.phase;
      let name = baseName;

      // Common artifact patterns
      if (file === 'design.md') {
        phase = 'design';
        name = 'design-document';
      } else if (file === 'test-results.md') {
        phase = 'testing';
        name = 'test-results';
      } else if (file === 'review.md') {
        phase = 'code_review';
        name = 'code-review';
      } else if (file === 'test-plan.md') {
        phase = 'run_test_plan';
        name = 'test-plan';
      } else if (file.endsWith('-diff.patch')) {
        phase = 'coding';
        name = baseName;
      }

      // Determine mime type
      let mime_type = 'text/plain';
      if (file.endsWith('.md')) {
        mime_type = 'text/markdown';
      } else if (file.endsWith('.patch')) {
        mime_type = 'text/x-patch';
      } else if (file.endsWith('.json')) {
        mime_type = 'application/json';
      }

      task.artifacts.push({
        name,
        phase,
        path: file,
        mime_type,
        created_at: now,
        source: 'agent',
      });
      updated = true;
    }

    if (updated) {
      this.updateSync(taskId, { artifacts: task.artifacts });
    }
  }

  private rowToTask(row: typeof tasks.$inferSelect): Task {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      phase: row.phase as Task['phase'],
      priority: row.priority as Task['priority'],
      story_id: row.story_id ?? undefined,
      parent_task: row.parent_task ?? undefined,
      created_by: row.created_by,
      merge_strategy: row.merge_strategy as Task['merge_strategy'],
      auto_advance: row.auto_advance,
      auto_approve: row.auto_approve,
      created_at: row.created_at,
      updated_at: row.updated_at,
      phase_entered_at: row.phase_entered_at,
      loop_count: row.loop_count,
      archived: row.archived,
      archived_at: row.archived_at ?? undefined,
      phase_agents: JSON.parse(row.phase_agents_json),
      phase_overrides: JSON.parse(row.phase_overrides_json),
      blockers: JSON.parse(row.blockers_json),
      artifacts: JSON.parse(row.artifacts_json),
      ports: JSON.parse(row.ports_json),
      worktrees: JSON.parse(row.worktrees_json),
    };
  }
}
