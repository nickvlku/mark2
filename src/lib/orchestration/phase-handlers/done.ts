import path from 'path';
import type { Task } from '../../yaml/schemas';
import { removeWorktree } from '../../utils/git';
import { getDb } from '../../db';
import {
  activityEntries,
  portAllocations,
  worktreeRecords,
} from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { PRService } from '../../services/pr-service';
import { CloneService } from '../../services/clone-service';
import { StoryService } from '../../services/story-service';
import { TaskService } from '../../services/task-service';
import { StoryRunService } from '../../services/story-run-service';

export interface DoneResult {
  prCreated: boolean;
  prUrl?: string;
  prNumber?: number;
  prError?: string;
  storyBranchMerged?: string;
  unblockedTasks: string[];
  autoStartedTasks: string[];
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
  const cloneService = new CloneService(mark2Dir);
  const storyService = new StoryService(mark2Dir);
  const taskService = new TaskService(mark2Dir);
  const storyRunService = new StoryRunService(mark2Dir);
  const result: DoneResult = {
    prCreated: false,
    unblockedTasks: [],
    autoStartedTasks: [],
    cleanedUp: false,
  };

  const branchName = cloneService.getBranchName(task.id);
  const worktreePath = path.join(mark2Dir, 'clones', task.id);

  // Step 1: Story-mode merge (task -> story branch) or standalone task PR.
  let mergedIntoStoryBranch = false;
  let storyMergeFailed = false;
  if (task.story_id) {
    const story = storyService.getById(task.story_id);
    const storyBranch = story?.execution.branch_name;
    const storyRunning = story
      && (story.execution.status === 'running' || story.execution.status === 'ready_to_merge');

    if (storyRunning && storyBranch) {
      const mergeStrategy = task.merge_strategy === 'preserve' ? 'merge' : 'squash';
      const mergeResult = await cloneService.mergeTaskIntoStory(task.id, storyBranch, mergeStrategy);

      if (mergeResult.success) {
        mergedIntoStoryBranch = true;
        result.storyBranchMerged = storyBranch;
      } else {
        storyMergeFailed = true;
        result.prError = mergeResult.error ?? 'Story merge failed';
        db.insert(activityEntries)
          .values({
            task_id: task.id,
            timestamp: now,
            source: 'orchestration',
            type: 'error',
            message: `Story branch merge failed: ${result.prError}`,
            metadata_json: JSON.stringify({ story_branch: storyBranch, merge_strategy: mergeStrategy }),
          })
          .run();
      }
    }
  }

  if (!mergedIntoStoryBranch) {
    try {
      const prService = new PRService(mark2Dir);
      const prResult = await prService.createPR(task.id, targetBranch);

      if (prResult.success) {
        result.prCreated = true;
        result.prUrl = prResult.url;
        result.prNumber = prResult.number;
      } else {
        result.prError = prResult.error;

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
  const blockedTasks = taskService.getBlocking(task.id);
  for (const blockedTask of blockedTasks) {
    try {
      await taskService.removeBlocker(blockedTask.id, task.id);
      result.unblockedTasks.push(blockedTask.id);

      db.insert(activityEntries)
        .values({
          task_id: blockedTask.id,
          timestamp: now,
          source: 'orchestration',
          type: 'note',
          message: `Blocker ${task.id} completed. Removed from blocker list.`,
        })
        .run();
    } catch (error: any) {
      db.insert(activityEntries)
        .values({
          task_id: blockedTask.id,
          timestamp: now,
          source: 'orchestration',
          type: 'error',
          message: `Failed to remove blocker ${task.id}: ${error?.message ?? String(error)}`,
        })
        .run();
    }
  }

  // Step 5: Story run orchestration updates (auto-start newly ready tasks + ready-to-merge status)
  if (task.story_id) {
    try {
      const startResult = await storyRunService.startReadyTasks(task.story_id);
      result.autoStartedTasks = startResult.started_task_ids;
      if (!storyMergeFailed) {
        await storyRunService.refreshReadyToMergeStatus(task.story_id);
      }
    } catch (error: any) {
      db.insert(activityEntries)
        .values({
          task_id: task.id,
          timestamp: now,
          source: 'orchestration',
          type: 'error',
          message: `Story auto-start failed: ${error?.message ?? String(error)}`,
          metadata_json: JSON.stringify({ story_id: task.story_id }),
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
  const storyMergeMessage = result.storyBranchMerged
    ? ` Merged into story branch ${result.storyBranchMerged}.`
    : '';
  const autoStartedMessage = result.autoStartedTasks.length > 0
    ? ` Auto-started: ${result.autoStartedTasks.join(', ')}.`
    : '';

  db.insert(activityEntries)
    .values({
      task_id: task.id,
      timestamp: now,
      source: 'orchestration',
      type: 'phase_change',
      message: `Task completed.${storyMergeMessage}${prMessage}${result.unblockedTasks.length > 0 ? ` Unblocked: ${result.unblockedTasks.join(', ')}.` : ''}${autoStartedMessage}`,
      metadata_json: JSON.stringify({
        pr_created: result.prCreated,
        pr_url: result.prUrl,
        pr_number: result.prNumber,
        pr_error: result.prError,
        story_branch_merged: result.storyBranchMerged,
        target_branch: targetBranch,
        unblocked_tasks: result.unblockedTasks,
        auto_started_tasks: result.autoStartedTasks,
        cleaned_up: result.cleanedUp,
      }),
    })
    .run();

  return result;
}
