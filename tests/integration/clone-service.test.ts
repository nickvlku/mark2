import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { initializeDatabase, closeDb } from '@/lib/db';
import { CloneService } from '@/lib/services/clone-service';
import { StoryService } from '@/lib/services/story-service';
import { TaskService } from '@/lib/services/task-service';

let projectRoot: string;
let mark2Dir: string;
let cloneService: CloneService;
let storyService: StoryService;
let taskService: TaskService;

function run(command: string, cwd: string): string {
  return execSync(command, { cwd, stdio: 'pipe', encoding: 'utf-8' });
}

beforeEach(() => {
  projectRoot = mkdtempSync(path.join(os.tmpdir(), 'mark2-clone-service-'));
  mark2Dir = path.join(projectRoot, '.mark2');

  mkdirSync(path.join(mark2Dir, 'tasks'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'stories'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'activity'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'artifacts'), { recursive: true });

  initializeDatabase(mark2Dir);

  run('git init', projectRoot);
  run('git config user.email "test@example.com"', projectRoot);
  run('git config user.name "Test User"', projectRoot);
  writeFileSync(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
  run('git add README.md', projectRoot);
  run('git commit -m "init"', projectRoot);
  run('git branch -M main', projectRoot);

  cloneService = new CloneService(mark2Dir);
  storyService = new StoryService(mark2Dir, undefined, true);
  taskService = new TaskService(mark2Dir, undefined, true);
});

afterEach(() => {
  closeDb();
  rmSync(projectRoot, { recursive: true, force: true });
});

describe('CloneService branch handling', () => {
  it('merges task branch into story branch even when task branch exists only in clone', async () => {
    const story = await storyService.create({
      title: 'Story',
      description: 'desc',
      created_by: 'human',
    });
    const storyBranch = `mark2/${story.id.toLowerCase()}`;
    run(`git branch "${storyBranch}" main`, projectRoot);
    await storyService.update(story.id, {
      execution: {
        status: 'running',
        branch_name: storyBranch,
        base_branch: 'main',
        target_branch: 'main',
        started_at: new Date().toISOString(),
        task_merge_failures: [],
      },
    });

    const task = await taskService.create({
      title: 'Task',
      description: 'desc',
      story_id: story.id,
      created_by: 'human',
    });
    await storyService.addTask(story.id, task.id);

    const cloneInfo = await cloneService.createClone(task.id);
    expect(cloneInfo.branchName).toBe(`${storyBranch}--task-${task.id.toLowerCase()}`);
    const fileName = 'task-change.txt';
    writeFileSync(path.join(cloneInfo.clonePath, fileName), 'from task branch\n', 'utf-8');
    run(`git add "${fileName}"`, cloneInfo.clonePath);
    run('git commit -m "task change"', cloneInfo.clonePath);

    expect(() => run(`git show-ref --verify --quiet "refs/heads/${cloneInfo.branchName}"`, projectRoot))
      .toThrow();

    const pushResult = await cloneService.push(task.id);
    expect(pushResult.success).toBe(true);
    expect(() => run(`git show-ref --verify --quiet "refs/heads/${cloneInfo.branchName}"`, projectRoot))
      .not.toThrow();

    const mergeResult = await cloneService.mergeTaskIntoStory(task.id, storyBranch, 'squash');
    if (!mergeResult.success) {
      throw new Error(`Expected story merge success, got: ${mergeResult.error}`);
    }

    const mergedFile = run(`git show "${storyBranch}:${fileName}"`, projectRoot);
    expect(mergedFile).toContain('from task branch');
  });

  it('keeps existing task branch name after story status changes to running', async () => {
    const story = await storyService.create({
      title: 'Story',
      description: 'desc',
      created_by: 'human',
    });
    const storyBranch = `mark2/${story.id.toLowerCase()}`;
    run(`git branch "${storyBranch}" main`, projectRoot);

    const task = await taskService.create({
      title: 'Task',
      description: 'desc',
      story_id: story.id,
      created_by: 'human',
    });
    await storyService.addTask(story.id, task.id);
    await taskService.update(task.id, { phase: 'design' });

    const cloneInfo = await cloneService.createClone(task.id);
    expect(cloneInfo.branchName).toBe(`mark2/${task.id}`);

    await storyService.update(story.id, {
      execution: {
        status: 'running',
        branch_name: storyBranch,
        base_branch: 'main',
        target_branch: 'main',
        started_at: new Date().toISOString(),
        task_merge_failures: [],
      },
    });

    expect(cloneService.getBranchName(task.id)).toBe(`mark2/${task.id}`);
  });

  it('normalizes legacy story-task branch names before publish operations', async () => {
    const story = await storyService.create({
      title: 'Story',
      description: 'desc',
      created_by: 'human',
    });
    const storyBranch = `mark2/${story.id.toLowerCase()}`;
    run(`git branch "${storyBranch}" main`, projectRoot);
    await storyService.update(story.id, {
      execution: {
        status: 'running',
        branch_name: storyBranch,
        base_branch: 'main',
        target_branch: 'main',
        started_at: new Date().toISOString(),
        task_merge_failures: [],
      },
    });

    const task = await taskService.create({
      title: 'Task',
      description: 'desc',
      story_id: story.id,
      created_by: 'human',
    });
    await storyService.addTask(story.id, task.id);

    const cloneInfo = await cloneService.createClone(task.id);
    const normalizedBranch = cloneInfo.branchName;
    const legacyBranch = `${storyBranch}/task-${task.id.toLowerCase()}`;
    run(`git -C "${cloneInfo.clonePath}" branch -m "${normalizedBranch}" "${legacyBranch}"`, projectRoot);
    rmSync(path.join(cloneInfo.clonePath, '.git', 'mark2-task-branch'), { force: true });

    const pushResult = await cloneService.push(task.id);
    if (!pushResult.success) {
      throw new Error(`Expected push success, got: ${pushResult.error}`);
    }
    expect(cloneService.getBranchName(task.id)).toBe(normalizedBranch);
    expect(() => run(`git show-ref --verify --quiet "refs/heads/${normalizedBranch}"`, projectRoot))
      .not.toThrow();
    expect(() => run(`git show-ref --verify --quiet "refs/heads/${legacyBranch}"`, projectRoot))
      .toThrow();
  });
});
