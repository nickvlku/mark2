import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { initializeDatabase, closeDb } from '@/lib/db';
import { StoryService } from '@/lib/services/story-service';
import { TaskService } from '@/lib/services/task-service';
import { StoryRunService } from '@/lib/services/story-run-service';

let projectRoot: string;
let mark2Dir: string;
let storyService: StoryService;
let taskService: TaskService;
let storyRunService: StoryRunService;
let startedTasks: string[];

beforeEach(() => {
  projectRoot = mkdtempSync(path.join(os.tmpdir(), 'mark2-story-run-'));
  mark2Dir = path.join(projectRoot, '.mark2');

  mkdirSync(path.join(mark2Dir, 'tasks'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'stories'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'activity'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'artifacts'), { recursive: true });

  initializeDatabase(mark2Dir);

  execSync('git init', { cwd: projectRoot, stdio: 'pipe' });
  execSync('git config user.email "test@example.com"', { cwd: projectRoot, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: projectRoot, stdio: 'pipe' });
  writeFileSync(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
  execSync('git add README.md', { cwd: projectRoot, stdio: 'pipe' });
  execSync('git commit -m "init"', { cwd: projectRoot, stdio: 'pipe' });
  execSync('git branch -M main', { cwd: projectRoot, stdio: 'pipe' });

  storyService = new StoryService(mark2Dir, undefined, true);
  taskService = new TaskService(mark2Dir, undefined, true);
  startedTasks = [];
  storyRunService = new StoryRunService(mark2Dir, {
    storyService,
    taskService,
    startPhaseFn: async (taskId) => {
      startedTasks.push(taskId);
    },
  });
});

afterEach(() => {
  closeDb();
  rmSync(projectRoot, { recursive: true, force: true });
});

describe('StoryRunService integration', () => {
  it('creates story branch and starts only unblocked pending tasks', async () => {
    const story = await storyService.create({
      title: 'Story run',
      description: 'desc',
      created_by: 'human',
    });

    const taskA = await taskService.create({
      title: 'Task A',
      description: 'desc',
      story_id: story.id,
      created_by: 'human',
    });
    const taskB = await taskService.create({
      title: 'Task B',
      description: 'desc',
      story_id: story.id,
      created_by: 'human',
    });

    await storyService.addTask(story.id, taskA.id);
    await storyService.addTask(story.id, taskB.id);
    await taskService.addBlocker(taskB.id, taskA.id);

    const result = await storyRunService.startStory(story.id);

    expect(result.branch_name).toBe(`mark2/${story.id.toLowerCase()}`);
    expect(result.started_task_ids).toEqual([taskA.id]);

    const taskAUpdated = taskService.getById(taskA.id);
    const taskBUpdated = taskService.getById(taskB.id);
    expect(taskAUpdated?.phase).toBe('design');
    expect(taskBUpdated?.phase).toBe('pending');
    expect(startedTasks).toEqual([taskA.id]);

    expect(() => {
      execSync(`git show-ref --verify --quiet refs/heads/${result.branch_name}`, {
        cwd: projectRoot,
        stdio: 'pipe',
      });
    }).not.toThrow();
  });

  it('marks running stories ready_to_merge when all tasks are done', async () => {
    const story = await storyService.create({
      title: 'Ready story',
      description: 'desc',
      created_by: 'human',
    });

    const task = await taskService.create({
      title: 'Task',
      description: 'desc',
      story_id: story.id,
      created_by: 'human',
    });
    await storyService.addTask(story.id, task.id);

    await storyRunService.startStory(story.id);
    await taskService.transitionPhase(task.id, 'done');
    await storyRunService.refreshReadyToMergeStatus(story.id);

    const updatedStory = storyService.getById(story.id);
    expect(updatedStory?.execution.status).toBe('ready_to_merge');
  });

  it('keeps story running when unresolved merge failures exist', async () => {
    const story = await storyService.create({
      title: 'Blocked ready state',
      description: 'desc',
      created_by: 'human',
    });

    const task = await taskService.create({
      title: 'Task',
      description: 'desc',
      story_id: story.id,
      created_by: 'human',
    });
    await storyService.addTask(story.id, task.id);

    await storyRunService.startStory(story.id);
    await taskService.transitionPhase(task.id, 'done');
    await storyService.update(story.id, {
      execution: {
        status: 'running',
        branch_name: `mark2/${story.id.toLowerCase()}`,
        base_branch: 'main',
        target_branch: 'main',
        started_at: new Date().toISOString(),
        task_merge_failures: [{
          task_id: task.id,
          error: 'Merge conflicts detected',
          failed_at: new Date().toISOString(),
        }],
      },
    });

    await storyRunService.refreshReadyToMergeStatus(story.id);

    const updatedStory = storyService.getById(story.id);
    expect(updatedStory?.execution.status).toBe('running');
  });
});
