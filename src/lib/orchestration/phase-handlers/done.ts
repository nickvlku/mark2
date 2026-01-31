import path from 'path';
import type { Task } from '../../yaml/schemas';
import { removeWorktree, gitExec } from '../../utils/git';
import { getDb } from '../../db';
import {
  tasks,
  activityEntries,
  portAllocations,
  worktreeRecords,
} from '../../db/schema';
import { eq, and } from 'drizzle-orm';

export interface DoneResult {
  merged: boolean;
  mergeError?: string;
  unblockedTasks: string[];
  cleanedUp: boolean;
}

/**
 * Handle the done phase for a task.
 *
 * 1. Merge the worktree branch to target branch (default: main)
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
    merged: false,
    unblockedTasks: [],
    cleanedUp: false,
  };

  const branchName = `mark2/${task.id}/design`;
  const worktreePath = path.join(projectRoot, '.worktrees', task.id, 'design');

  // Step 1: Merge to target branch
  try {
    const strategy = task.merge_strategy === 'squash' ? '--squash' : '--no-ff';

    // Checkout target branch and merge
    await gitExec(`git checkout "${targetBranch}"`, projectRoot);
    await gitExec(`git merge ${strategy} "${branchName}" -m "mark2: merge ${task.id} - ${task.title}"`, projectRoot);

    if (task.merge_strategy === 'squash') {
      await gitExec(`git commit -m "mark2: ${task.id} - ${task.title}"`, projectRoot);
    }

    result.merged = true;
  } catch (err: any) {
    result.mergeError = err.message ?? 'Unknown merge error';

    // Log the merge failure
    db.insert(activityEntries)
      .values({
        task_id: task.id,
        timestamp: now,
        source: 'orchestration',
        type: 'error',
        message: `Merge to ${targetBranch} failed: ${result.mergeError}`,
      })
      .run();

    // Abort the merge attempt
    try {
      await gitExec('git merge --abort', projectRoot);
    } catch {
      // May not be in a merge state
    }
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
  db.insert(activityEntries)
    .values({
      task_id: task.id,
      timestamp: now,
      source: 'orchestration',
      type: 'phase_change',
      message: `Task completed.${result.merged ? ` Changes merged to ${targetBranch}.` : ' Merge failed.'}${result.unblockedTasks.length > 0 ? ` Unblocked: ${result.unblockedTasks.join(', ')}.` : ''}`,
      metadata_json: JSON.stringify({
        merged: result.merged,
        merge_error: result.mergeError,
        target_branch: targetBranch,
        unblocked_tasks: result.unblockedTasks,
        cleaned_up: result.cleanedUp,
      }),
    })
    .run();

  return result;
}
