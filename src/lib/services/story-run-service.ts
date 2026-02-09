import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { getMark2Dir } from '../utils/mark2-dir';
import { StoryService } from './story-service';
import { TaskService } from './task-service';
import { OrchestrationEngine } from '../orchestration/engine';
import type { Phase, Story } from '../yaml/schemas';

const exec = promisify(execCb);

type ExecResult = { stdout: string; stderr: string };

export interface StartStoryResult {
  story_id: string;
  branch_name: string;
  ready_task_ids: string[];
  started_task_ids: string[];
  failed: Array<{ task_id: string; error: string }>;
}

export interface StartReadyTasksResult {
  ready_task_ids: string[];
  started_task_ids: string[];
  failed: Array<{ task_id: string; error: string }>;
}

export interface StoryMergePRResult {
  success: boolean;
  url?: string;
  number?: number;
  error?: string;
}

export interface StoryRunServiceDeps {
  storyService?: StoryService;
  taskService?: TaskService;
  execFn?: (command: string, cwd: string) => Promise<ExecResult>;
  startPhaseFn?: (taskId: string, phase: Phase) => Promise<void>;
}

export class StoryRunService {
  private mark2Dir: string;
  private projectRoot: string;
  private storyService: StoryService;
  private taskService: TaskService;
  private execFn: (command: string, cwd: string) => Promise<ExecResult>;
  private startPhaseFn?: (taskId: string, phase: Phase) => Promise<void>;

  constructor(mark2Dir?: string, deps?: StoryRunServiceDeps) {
    this.mark2Dir = mark2Dir ?? getMark2Dir();
    this.projectRoot = path.dirname(this.mark2Dir);
    this.storyService = deps?.storyService ?? new StoryService(this.mark2Dir);
    this.taskService = deps?.taskService ?? new TaskService(this.mark2Dir);
    this.execFn = deps?.execFn ?? ((command, cwd) => exec(command, { cwd, encoding: 'utf-8' }));
    this.startPhaseFn = deps?.startPhaseFn;
  }

  getStoryBranchName(storyId: string): string {
    return `mark2/${storyId.toLowerCase()}`;
  }

  async startStory(
    storyId: string,
    options?: { base_branch?: string; target_branch?: string },
  ): Promise<StartStoryResult> {
    const story = this.storyService.getById(storyId);
    if (!story) {
      throw new Error(`Story ${storyId} not found`);
    }

    const currentExecution = story.execution ?? {
      status: 'idle' as const,
      base_branch: 'main',
      target_branch: 'main',
    };

    const baseBranch = options?.base_branch ?? currentExecution.base_branch ?? 'main';
    const targetBranch = options?.target_branch ?? currentExecution.target_branch ?? 'main';
    const branchName = currentExecution.branch_name ?? this.getStoryBranchName(storyId);

    await this.ensureStoryBranch(branchName, baseBranch);

    await this.storyService.update(storyId, {
      execution: {
        ...currentExecution,
        status: 'running',
        branch_name: branchName,
        base_branch: baseBranch,
        target_branch: targetBranch,
        started_at: currentExecution.started_at ?? new Date().toISOString(),
        completed_at: undefined,
      },
    });

    const startResult = await this.startReadyTasks(storyId);
    await this.refreshReadyToMergeStatus(storyId);

    return {
      story_id: storyId,
      branch_name: branchName,
      ready_task_ids: startResult.ready_task_ids,
      started_task_ids: startResult.started_task_ids,
      failed: startResult.failed,
    };
  }

  async startReadyTasks(storyId: string): Promise<StartReadyTasksResult> {
    const story = this.storyService.getById(storyId);
    if (!story) {
      throw new Error(`Story ${storyId} not found`);
    }

    if (story.execution.status === 'idle' || story.execution.status === 'merged') {
      return { ready_task_ids: [], started_task_ids: [], failed: [] };
    }

    const storyTasks = this.taskService.list({ story_id: storyId, archived: false });
    const readyTasks = [];

    for (const task of storyTasks) {
      if (task.phase !== 'pending') continue;
      if (!this.taskService.allBlockersResolved(task.id)) continue;

      const sessionStatus = await this.taskService.getSessionStatus(task.id);
      if (sessionStatus === 'running') continue;

      readyTasks.push(task);
    }

    const startedTaskIds: string[] = [];
    const failed: Array<{ task_id: string; error: string }> = [];

    // Transition sequentially to avoid concurrent state branch git pushes.
    for (const task of readyTasks) {
      try {
        await this.taskService.transitionPhase(task.id, 'design');
        startedTaskIds.push(task.id);
      } catch (error: any) {
        failed.push({
          task_id: task.id,
          error: error?.message ?? String(error),
        });
      }
    }

    await Promise.all(
      startedTaskIds.map(async (taskId) => {
        try {
          await this.startPhase(taskId, 'design');
        } catch (error: any) {
          failed.push({
            task_id: taskId,
            error: error?.message ?? String(error),
          });
        }
      }),
    );

    return {
      ready_task_ids: readyTasks.map((t) => t.id),
      started_task_ids: startedTaskIds,
      failed,
    };
  }

  async refreshReadyToMergeStatus(storyId: string): Promise<Story> {
    const story = this.storyService.getById(storyId);
    if (!story) {
      throw new Error(`Story ${storyId} not found`);
    }

    if (story.execution.status === 'idle' || story.execution.status === 'merged') {
      return story;
    }

    const storyTasks = this.taskService.list({ story_id: storyId, archived: false });
    const allDone = storyTasks.length > 0 && storyTasks.every((task) => task.phase === 'done');

    if (allDone && story.execution.status !== 'ready_to_merge') {
      return this.storyService.update(storyId, {
        execution: {
          ...story.execution,
          status: 'ready_to_merge',
          completed_at: new Date().toISOString(),
        },
      });
    }

    if (!allDone && story.execution.status === 'ready_to_merge') {
      return this.storyService.update(storyId, {
        execution: {
          ...story.execution,
          status: 'running',
        },
      });
    }

    return story;
  }

  async createMergePR(storyId: string, targetBranch?: string): Promise<StoryMergePRResult> {
    const story = this.storyService.getById(storyId);
    if (!story) {
      return { success: false, error: `Story ${storyId} not found` };
    }

    const branchName = story.execution.branch_name;
    if (!branchName) {
      return { success: false, error: `Story ${storyId} does not have a story branch` };
    }

    const storyTasks = this.taskService.list({ story_id: storyId, archived: false });
    const allDone = storyTasks.length > 0 && storyTasks.every((task) => task.phase === 'done');
    if (!allDone) {
      return { success: false, error: `Story ${storyId} is not complete. All tasks must be in done.` };
    }

    const resolvedTargetBranch = targetBranch ?? story.execution.target_branch ?? 'main';
    await this.refreshReadyToMergeStatus(storyId);

    try {
      // Best effort push in case branch moved since start.
      await this.execGit(`push -u origin "${branchName}"`).catch(() => {});

      const title = `${story.id}: ${story.title}`;
      const body = [
        `Story ${story.id} is complete and ready to merge.`,
        '',
        `Tasks (${storyTasks.length}): ${storyTasks.map((t) => t.id).join(', ')}`,
        '',
        'Generated by mark2 story-run.',
      ].join('\n');

      let prUrl = '';
      let prNumber: number | undefined;

      try {
        const { stdout } = await this.execGit(
          `gh pr create --base "${resolvedTargetBranch}" --head "${branchName}" --title ${JSON.stringify(title)} --body ${JSON.stringify(body)}`,
        );
        prUrl = stdout.trim();
      } catch (error: any) {
        if (String(error?.message ?? '').toLowerCase().includes('already exists')) {
          const { stdout } = await this.execGit(
            `gh pr view "${branchName}" --json url --jq .url`,
          );
          prUrl = stdout.trim();
        } else {
          throw error;
        }
      }

      const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
      if (prNumberMatch) {
        prNumber = parseInt(prNumberMatch[1], 10);
      }

      await this.storyService.update(storyId, {
        execution: {
          ...story.execution,
          status: 'ready_to_merge',
          target_branch: resolvedTargetBranch,
          merge_pr_url: prUrl || undefined,
          merge_pr_number: prNumber,
          merge_requested_at: new Date().toISOString(),
        },
      });

      return {
        success: true,
        url: prUrl || undefined,
        number: prNumber,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message ?? String(error),
      };
    }
  }

  private async startPhase(taskId: string, phase: Phase): Promise<void> {
    if (this.startPhaseFn) {
      await this.startPhaseFn(taskId, phase);
      return;
    }

    const engine = OrchestrationEngine.getInstance({
      projectRoot: this.projectRoot,
      mark2Dir: this.mark2Dir,
      apiBaseUrl: `http://localhost:${process.env.PORT || 3100}`,
      agentToken: process.env.MARK2_AGENT_TOKEN || 'mark2-local',
    });

    await engine.startPhase(taskId, phase);
  }

  private async ensureStoryBranch(branchName: string, baseBranch: string): Promise<void> {
    await this.execGit(`fetch origin "${baseBranch}"`).catch(() => {});

    const localBranchExists = await this.hasLocalBranch(branchName);
    if (!localBranchExists) {
      const remoteBaseExists = await this.hasRemoteBranch(baseBranch);
      if (remoteBaseExists) {
        await this.execGit(`branch "${branchName}" "origin/${baseBranch}"`);
      } else if (await this.hasLocalBranch(baseBranch)) {
        await this.execGit(`branch "${branchName}" "${baseBranch}"`);
      } else {
        await this.execGit(`branch "${branchName}" HEAD`);
      }
    }

    await this.execGit(`push -u origin "${branchName}"`).catch(() => {});
  }

  private async hasLocalBranch(branchName: string): Promise<boolean> {
    try {
      await this.execGit(`show-ref --verify --quiet "refs/heads/${branchName}"`);
      return true;
    } catch {
      return false;
    }
  }

  private async hasRemoteBranch(branchName: string): Promise<boolean> {
    try {
      const { stdout } = await this.execGit(`ls-remote --heads origin "${branchName}"`);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  private async execGit(args: string): Promise<ExecResult> {
    return this.execFn(`git ${args}`, this.projectRoot);
  }
}
