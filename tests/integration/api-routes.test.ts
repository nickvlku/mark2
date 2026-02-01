import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';
import { initializeDatabase, closeDb } from '@/lib/db';
import { TaskService } from '@/lib/services/task-service';
import { StoryService } from '@/lib/services/story-service';

let mark2Dir: string;
let taskService: TaskService;
let storyService: StoryService;

beforeEach(() => {
  mark2Dir = mkdtempSync(path.join(os.tmpdir(), 'mark2-api-test-'));
  mkdirSync(path.join(mark2Dir, 'tasks'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'stories'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'activity'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'artifacts'), { recursive: true });
  initializeDatabase(mark2Dir);
  // Use localOnly=true to skip git operations in tests
  taskService = new TaskService(mark2Dir, undefined, true);
  storyService = new StoryService(mark2Dir, undefined, true);
});

afterEach(() => {
  closeDb();
  rmSync(mark2Dir, { recursive: true, force: true });
});

describe('Task creation (simulating API route)', () => {
  it('creates a task with only title (matching UI dialog payload)', async () => {
    // This is exactly what the CreateTaskDialog sends
    const body: { title: string; description: string; priority: string; story_id: undefined; created_by?: string } = {
      title: 'My new task',
      description: '',
      priority: 'P2',
      story_id: undefined,
    };

    const task = await taskService.create({
      title: body.title,
      description: body.description || '',
      priority: body.priority,
      created_by: body.created_by || 'human',
    });

    expect(task.id).toBe('TASK-1');
    expect(task.title).toBe('My new task');
    expect(task.description).toBe('');
    expect(task.created_by).toBe('human');
    expect(task.phase).toBe('pending');
    expect(task.priority).toBe('P2');
  });

  it('creates a task with title and description', async () => {
    const task = await taskService.create({
      title: 'Build login page',
      description: 'Create the login page with form validation',
      created_by: 'human',
    });

    expect(task.id).toBe('TASK-1');
    expect(task.title).toBe('Build login page');
    expect(task.description).toBe('Create the login page with form validation');
    expect(task.created_by).toBe('human');
  });

  it('creates a task with all fields', async () => {
    const task = await taskService.create({
      title: 'Full task',
      description: 'A fully specified task',
      priority: 'P0',
      created_by: 'ci-system',
      phase_agents: { coding: 'coder' },
      blockers: [],
    });

    expect(task.id).toBe('TASK-1');
    expect(task.priority).toBe('P0');
    expect(task.created_by).toBe('ci-system');
    expect(task.phase_agents).toEqual({ coding: 'coder' });
  });

  it('creates multiple tasks with sequential IDs', async () => {
    const t1 = await taskService.create({
      title: 'First task',
      description: '',
      created_by: 'human',
    });
    const t2 = await taskService.create({
      title: 'Second task',
      description: '',
      created_by: 'human',
    });
    const t3 = await taskService.create({
      title: 'Third task',
      description: '',
      created_by: 'human',
    });

    expect(t1.id).toBe('TASK-1');
    expect(t2.id).toBe('TASK-2');
    expect(t3.id).toBe('TASK-3');
  });

  it('created task is retrievable via getById', async () => {
    const created = await taskService.create({
      title: 'Retrievable task',
      description: 'Should be findable',
      created_by: 'human',
    });

    const retrieved = taskService.getById(created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.title).toBe('Retrievable task');
    expect(retrieved!.description).toBe('Should be findable');
  });

  it('created task appears in list', async () => {
    await taskService.create({
      title: 'Listed task',
      description: 'In the list',
      created_by: 'human',
    });

    const all = taskService.list();
    expect(all.length).toBe(1);
    expect(all[0].title).toBe('Listed task');
  });

  it('rejects empty title via Zod validation', async () => {
    await expect(
      taskService.create({
        title: '',
        description: 'No title',
        created_by: 'human',
      })
    ).rejects.toThrow();
  });

  it('rejects title over 200 characters', async () => {
    await expect(
      taskService.create({
        title: 'x'.repeat(201),
        description: 'Too long title',
        created_by: 'human',
      })
    ).rejects.toThrow();
  });
});

describe('Story creation (simulating API route)', () => {
  it('creates a story with only title (matching UI dialog payload)', async () => {
    // This is exactly what the CreateStoryDialog sends
    const body: { title: string; description: string; created_by?: string } = {
      title: 'My new story',
      description: '',
    };

    const story = await storyService.create({
      title: body.title,
      description: body.description || '',
      created_by: body.created_by || 'human',
    });

    expect(story.id).toBe('STORY-1');
    expect(story.title).toBe('My new story');
    expect(story.description).toBe('');
    expect(story.created_by).toBe('human');
    expect(story.tasks).toEqual([]);
  });

  it('creates a story with title and description', async () => {
    const story = await storyService.create({
      title: 'Auth system',
      description: 'Full authentication implementation',
      created_by: 'human',
    });

    expect(story.id).toBe('STORY-1');
    expect(story.title).toBe('Auth system');
    expect(story.description).toBe('Full authentication implementation');
  });

  it('creates multiple stories with sequential IDs', async () => {
    const s1 = await storyService.create({
      title: 'First story',
      description: '',
      created_by: 'human',
    });
    const s2 = await storyService.create({
      title: 'Second story',
      description: '',
      created_by: 'human',
    });

    expect(s1.id).toBe('STORY-1');
    expect(s2.id).toBe('STORY-2');
  });

  it('created story is retrievable via getById', async () => {
    const created = await storyService.create({
      title: 'Retrievable story',
      description: 'Should be findable',
      created_by: 'human',
    });

    const retrieved = storyService.getById(created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.title).toBe('Retrievable story');
  });

  it('created story appears in list', async () => {
    await storyService.create({
      title: 'Listed story',
      description: 'In the list',
      created_by: 'human',
    });

    const all = storyService.list();
    expect(all.length).toBe(1);
    expect(all[0].title).toBe('Listed story');
  });

  it('rejects empty title via Zod validation', async () => {
    await expect(
      storyService.create({
        title: '',
        description: 'No title',
        created_by: 'human',
      })
    ).rejects.toThrow();
  });
});

describe('Task + Story association', () => {
  it('creates task with story_id and retrieves it', async () => {
    const story = await storyService.create({
      title: 'Parent story',
      description: 'Has tasks',
      created_by: 'human',
    });

    const task = await taskService.create({
      title: 'Child task',
      description: 'Belongs to story',
      story_id: story.id,
      created_by: 'human',
    });

    expect(task.story_id).toBe('STORY-1');

    const retrieved = taskService.getById(task.id);
    expect(retrieved!.story_id).toBe('STORY-1');
  });

  it('adds task to story and retrieves association', async () => {
    const story = await storyService.create({
      title: 'Story with tasks',
      description: '',
      created_by: 'human',
    });

    const task = await taskService.create({
      title: 'Associated task',
      description: '',
      created_by: 'human',
    });

    await storyService.addTask(story.id, task.id);

    const updated = storyService.getById(story.id);
    expect(updated!.tasks).toContain('TASK-1');
  });
});
