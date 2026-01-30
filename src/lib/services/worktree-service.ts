import { getDb } from '../db';
import { worktreeRecords } from '../db/schema';
import { createWorktree, removeWorktree } from '../utils/git';
import { eq, and } from 'drizzle-orm';
import path from 'path';

export interface WorktreeRecord {
  id: number;
  task_id: string;
  agent_name: string;
  worktree_path: string;
  branch_name: string;
  created_at: string;
  status: string;
}

export class WorktreeService {
  private mark2Dir: string;
  private projectRoot: string;

  constructor(mark2Dir?: string) {
    this.mark2Dir = mark2Dir ?? path.join(process.cwd(), '.mark2');
    this.projectRoot = path.dirname(this.mark2Dir);
  }

  async create(
    taskId: string,
    agentName: string,
    isBakeoff: boolean = false,
  ): Promise<WorktreeRecord> {
    const suffix = isBakeoff ? `-bakeoff-${agentName}` : '';
    const branchName = `mark2/${taskId.toLowerCase()}${suffix ? suffix : `-${agentName}`}`;
    const worktreePath = path.join(
      this.projectRoot,
      '.worktrees',
      `${taskId}${suffix ? suffix : `-${agentName}`}`,
    );

    // Create git worktree + branch
    await createWorktree(this.projectRoot, worktreePath, branchName);

    // Record in SQLite
    const now = new Date().toISOString();
    const db = getDb(this.mark2Dir);
    const result = db.insert(worktreeRecords).values({
      task_id: taskId,
      agent_name: agentName,
      worktree_path: worktreePath,
      branch_name: branchName,
      created_at: now,
      status: 'active',
    }).returning().get();

    return {
      id: result.id,
      task_id: result.task_id,
      agent_name: result.agent_name,
      worktree_path: result.worktree_path,
      branch_name: result.branch_name,
      created_at: result.created_at,
      status: result.status,
    };
  }

  async cleanup(taskId: string, agentName: string): Promise<void> {
    const db = getDb(this.mark2Dir);

    // Find the worktree record
    const record = db
      .select()
      .from(worktreeRecords)
      .where(
        and(
          eq(worktreeRecords.task_id, taskId),
          eq(worktreeRecords.agent_name, agentName),
          eq(worktreeRecords.status, 'active'),
        ),
      )
      .get();

    if (!record) {
      throw new Error(`No active worktree found for task ${taskId}, agent ${agentName}`);
    }

    // Remove git worktree + branch
    await removeWorktree(this.projectRoot, record.worktree_path, record.branch_name);

    // Update status in SQLite
    db.update(worktreeRecords)
      .set({ status: 'removed' })
      .where(eq(worktreeRecords.id, record.id))
      .run();
  }

  list(): WorktreeRecord[] {
    const db = getDb(this.mark2Dir);
    const rows = db
      .select()
      .from(worktreeRecords)
      .where(eq(worktreeRecords.status, 'active'))
      .all();

    return rows.map((row) => ({
      id: row.id,
      task_id: row.task_id,
      agent_name: row.agent_name,
      worktree_path: row.worktree_path,
      branch_name: row.branch_name,
      created_at: row.created_at,
      status: row.status,
    }));
  }

  getForTask(taskId: string): WorktreeRecord[] {
    const db = getDb(this.mark2Dir);
    const rows = db
      .select()
      .from(worktreeRecords)
      .where(
        and(
          eq(worktreeRecords.task_id, taskId),
          eq(worktreeRecords.status, 'active'),
        ),
      )
      .all();

    return rows.map((row) => ({
      id: row.id,
      task_id: row.task_id,
      agent_name: row.agent_name,
      worktree_path: row.worktree_path,
      branch_name: row.branch_name,
      created_at: row.created_at,
      status: row.status,
    }));
  }
}
