import path from 'path';
import type { Task } from '../../yaml/schemas';
import type { RoleConfig } from './run-phase';
import { removeWorktree } from '../../utils/git';
import { getDb } from '../../db';
import {
  tasks,
  activityEntries,
  portAllocations,
  worktreeRecords,
} from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { PRService } from '../../services/pr-service';

export interface DoneResult {
  prCreated: boolean;
  prUrl?: string;
  prNumber?: number;
  prError?: string;
  unblockedTasks: string[];
  cleanedUp: boolean;
}

/**
 * Handle the done phase for a task.
 *
 * 1. Create a GitHub PR for the task branch
 * 2. Cleanup the worktree
 * 3. Release allocated ports
 * 4. Find and unblock dependent tasks
 */
export async function handleDone(
  task: Task,
  projectRoot: string,
  mark2Dir: string,
  targetBranch: string = 'main',
): Promise<DoneResult> {
  const db = getDb(mark2Dir);
  const now = new Date().toISOString();
  const result: DoneResult = {
    prCreated: false,
    unblockedTasks: [],
    cleanedUp: false,
  };

  const branchName = `mark2/${task.id}`;
  const worktreePath = path.join(mark2Dir, 'clones', task.id);

  // Step 1: Create PR instead of local merge
  try {
    const prService = new PRService(mark2Dir);
    const prResult = await prService.createPR(task.id, targetBranch);

    if (prResult.success) {
      result.prCreated = true;
      result.prUrl = prResult.url;
      result.prNumber = prResult.number;
    } else {
      result.prError = prResult.error;

      // Log the PR creation failure
      db.insert(activityEntries)
        .values({
          task_id: task.id,
          timestamp: now,
          source: 'orchestration',
          type: 'error',
          message: `PR creation failed: ${result.prError}`,
        })
        .run();
    }
  } catch (err: any) {
    result.prError = err.message ?? 'Unknown PR creation error';

    // Log the error
    db.insert(activityEntries)
      .values({
        task_id: task.id,
        timestamp: now,
        source: 'orchestration',
        type: 'error',
        message: `PR creation failed: ${result.prError}`,
      })
      .run();
  }

  // Step 2: Cleanup worktree
  try {
    await removeWorktree(projectRoot, worktreePath, branchName);

    // Update worktree records
    db.update(worktreeRecords)
      .set({ status: 'removed' })
      .where(
        and(
          eq(worktreeRecords.task_id, task.id),
          eq(worktreeRecords.status, 'active'),
        ),
      )
      .run();

    result.cleanedUp = true;
  } catch {
    // Worktree cleanup is best-effort
  }

  // Step 3: Release ports
  try {
    db.delete(portAllocations)
      .where(eq(portAllocations.task_id, task.id))
      .run();
  } catch {
    // Port release is best-effort
  }

  // Step 4: Find and unblock dependent tasks
  // Query all tasks that list this task as a blocker
  const allTasks = db.select().from(tasks).all();

  for (const row of allTasks) {
    const blockers: string[] = JSON.parse(row.blockers_json ?? '[]');
    if (blockers.includes(task.id)) {
      // Remove this task from the blocker list
      const updatedBlockers = blockers.filter((b) => b !== task.id);
      db.update(tasks)
        .set({
          blockers_json: JSON.stringify(updatedBlockers),
          updated_at: now,
        })
        .where(eq(tasks.id, row.id))
        .run();

      result.unblockedTasks.push(row.id);

      // Log unblocking
      db.insert(activityEntries)
        .values({
          task_id: row.id,
          timestamp: now,
          source: 'orchestration',
          type: 'note',
          message: `Blocker ${task.id} completed. Removed from blocker list.`,
        })
        .run();
    }
  }

  // Log completion
  const prMessage = result.prCreated
    ? ` PR created: ${result.prUrl}`
    : result.prError
      ? ` PR creation failed: ${result.prError}`
      : '';

  db.insert(activityEntries)
    .values({
      task_id: task.id,
      timestamp: now,
      source: 'orchestration',
      type: 'phase_change',
      message: `Task completed.${prMessage}${result.unblockedTasks.length > 0 ? ` Unblocked: ${result.unblockedTasks.join(', ')}.` : ''}`,
      metadata_json: JSON.stringify({
        pr_created: result.prCreated,
        pr_url: result.prUrl,
        pr_number: result.prNumber,
        pr_error: result.prError,
        target_branch: targetBranch,
        unblocked_tasks: result.unblockedTasks,
        cleaned_up: result.cleanedUp,
      }),
    })
    .run();

  return result;
}
