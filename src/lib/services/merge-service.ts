import { gitExec } from '../utils/git';
import { YamlReader } from '../yaml/reader';
import { ActivityService } from './activity-service';
import type { MergeResult } from '../../types';
import path from 'path';

export class MergeService {
  private projectRoot: string;
  private mark2Dir: string;
  private reader: YamlReader;
  private activityService: ActivityService;

  constructor(projectRoot: string, mark2Dir?: string) {
    this.projectRoot = projectRoot;
    this.mark2Dir = mark2Dir ?? path.join(projectRoot, '.mark2');
    this.reader = new YamlReader(this.mark2Dir);
    this.activityService = new ActivityService(this.mark2Dir);
  }

  /**
   * Merge a task branch into main using the task's configured merge_strategy.
   */
  async mergeTask(taskId: string): Promise<MergeResult> {
    const { data: task } = this.reader.readTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const branchName = `mark2/${taskId.toLowerCase()}`;
    const strategy = task.merge_strategy ?? 'squash';

    // Ensure we're on main
    await gitExec('git checkout main', this.projectRoot);
    await gitExec('git pull --ff-only origin main', this.projectRoot);

    let result: MergeResult;

    if (strategy === 'squash') {
      result = await this.squashMerge(branchName, taskId, task.title);
    } else {
      result = await this.preserveMerge(branchName, taskId);
    }

    // Log activity
    if (result.success) {
      this.activityService.log(
        taskId,
        'system',
        'note',
        `Branch ${branchName} merged to main using ${strategy} strategy`,
        { branch: branchName, strategy },
      );
    } else {
      this.activityService.log(
        taskId,
        'system',
        'error',
        `Merge failed for branch ${branchName}: ${result.error}`,
        { branch: branchName, strategy, error: result.error },
      );
    }

    return result;
  }

  /**
   * Squash merge: squash all commits into one, merge to main.
   */
  private async squashMerge(
    branch: string,
    taskId: string,
    title: string,
  ): Promise<MergeResult> {
    try {
      await gitExec(`git merge --squash "${branch}"`, this.projectRoot);
      await gitExec(
        `git commit -m "${taskId}: ${title.replace(/"/g, '\\"')}"`,
        this.projectRoot,
      );
      return { success: true };
    } catch {
      const conflict = await this.hasConflict();
      if (conflict) {
        return { success: false, error: 'merge_conflict' };
      }
      return { success: false, error: 'rebase_failed' };
    }
  }

  /**
   * Preserve merge: merge with --no-ff to keep commit history.
   */
  private async preserveMerge(
    branch: string,
    taskId: string,
  ): Promise<MergeResult> {
    try {
      await gitExec(
        `git merge --no-ff "${branch}" -m "Merge ${taskId}"`,
        this.projectRoot,
      );
      return { success: true };
    } catch {
      const conflict = await this.hasConflict();
      if (conflict) {
        return { success: false, error: 'merge_conflict' };
      }
      return { success: false, error: 'rebase_failed' };
    }
  }

  /**
   * Abort a merge in progress.
   */
  async abortMerge(): Promise<void> {
    await gitExec('git merge --abort', this.projectRoot);
  }

  /**
   * Check if there's a merge conflict in the working tree.
   */
  async hasConflict(): Promise<boolean> {
    try {
      const { stdout } = await gitExec('git diff --name-only --diff-filter=U', this.projectRoot);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }
}
