import { getDb } from '../db';
import { tasks, activityEntries, agentSessions } from '../db/schema';
import { YamlReader } from '../yaml/reader';
import { YamlWriter } from '../yaml/writer';
import { TaskSchema, Phase } from '../yaml/schemas';
import type { Task, TaskPhaseOverride } from '../yaml/schemas';
import { generateTaskId } from '../utils/id-generator';
import { ensureTaskStorageExistsSync, getTaskStoragePaths } from '../utils/storage';
import { eq, and, sql, desc } from 'drizzle-orm';
import { isSessionAlive } from '../utils/tmux';
import fs from 'fs';

export type SessionStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface TaskWithSession extends Task {
  session_status: SessionStatus;
}
import path from 'path';

export class TaskService {
  private reader: YamlReader;
  private writer: YamlWriter;
  private mark2Dir: string;

  constructor(mark2Dir?: string) {
    this.mark2Dir = mark2Dir ?? path.join(process.cwd(), '.mark2');
    this.reader = new YamlReader(this.mark2Dir);
    this.writer = new YamlWriter(this.mark2Dir);
  }

  create(data: {
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
    });

    // Write YAML (canonical store)
    this.writer.writeTask(task);

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
      created_at: task.created_at,
      updated_at: task.updated_at,
      phase_entered_at: task.phase_entered_at,
      loop_count: task.loop_count,
      phase_agents_json: JSON.stringify(task.phase_agents),
      phase_overrides_json: JSON.stringify(task.phase_overrides),
      blockers_json: JSON.stringify(task.blockers),
      artifacts_json: JSON.stringify(task.artifacts),
      ports_json: JSON.stringify(task.ports),
      worktrees_json: JSON.stringify(task.worktrees),
    }).run();

    // Initialize activity log
    this.writer.writeActivity({ task_id: task.id, entries: [] });

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

  update(taskId: string, updates: Partial<Task>): Task {
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

    // Write YAML
    this.writer.writeTask(task);

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

  delete(taskId: string): void {
    // Delete YAML files
    this.writer.deleteTask(taskId);

    // Delete from SQLite
    const db = getDb(this.mark2Dir);
    db.delete(tasks).where(eq(tasks.id, taskId)).run();
    db.delete(activityEntries).where(eq(activityEntries.task_id, taskId)).run();
  }

  addBlocker(taskId: string, blockerId: string): Task {
    const task = this.getById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    if (task.blockers.includes(blockerId)) {
      return task; // Already exists
    }
    return this.update(taskId, {
      blockers: [...task.blockers, blockerId],
    });
  }

  removeBlocker(taskId: string, blockerId: string): Task {
    const task = this.getById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    return this.update(taskId, {
      blockers: task.blockers.filter((b) => b !== blockerId),
    });
  }

  transitionPhase(taskId: string, newPhase: string): Task {
    const parsed = Phase.parse(newPhase);
    const task = this.getById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const now = new Date().toISOString();
    const oldPhase = task.phase;

    const updated = this.update(taskId, {
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
    const { data: activityLog } = this.reader.readActivity(taskId);
    const entries = activityLog?.entries ?? [];
    entries.push({
      timestamp: now,
      source: 'system',
      type: 'phase_change',
      message: `Phase transitioned from ${oldPhase} to ${parsed}`,
      metadata: { old_phase: oldPhase, new_phase: parsed },
    });
    this.writer.writeActivity({ task_id: taskId, entries });

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
        phase = 'manual_testing';
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
      });
      updated = true;
    }

    if (updated) {
      this.update(taskId, { artifacts: task.artifacts });
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
      phase_agents: JSON.parse(row.phase_agents_json),
      phase_overrides: JSON.parse(row.phase_overrides_json),
      blockers: JSON.parse(row.blockers_json),
      artifacts: JSON.parse(row.artifacts_json),
      ports: JSON.parse(row.ports_json),
      worktrees: JSON.parse(row.worktrees_json),
    };
  }
}
