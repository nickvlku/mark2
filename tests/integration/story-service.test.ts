import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { initializeDatabase, closeDb, getDb } from '@/lib/db';
import { stories } from '@/lib/db/schema';
import { StoryService } from '@/lib/services/story-service';
import { TaskService } from '@/lib/services/task-service';
import { YamlReader } from '@/lib/yaml/reader';
import { eq } from 'drizzle-orm';

let mark2Dir: string;
let storyService: StoryService;
let taskService: TaskService;
let reader: YamlReader;

beforeEach(() => {
  mark2Dir = mkdtempSync(path.join(os.tmpdir(), 'mark2-test-'));
  mkdirSync(path.join(mark2Dir, 'tasks'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'stories'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'activity'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'artifacts'), { recursive: true });
  initializeDatabase(mark2Dir);
  // Use localOnly=true to skip git operations in tests
  storyService = new StoryService(mark2Dir, undefined, true);
  taskService = new TaskService(mark2Dir, undefined, true);
  reader = new YamlReader(mark2Dir);
});

afterEach(() => {
  closeDb();
  rmSync(mark2Dir, { recursive: true, force: true });
});

describe('StoryService', () => {
  describe('create', () => {
    it('creates a story in both YAML and DB', async () => {
      const story = await storyService.create({
        title: 'Authentication Epic',
        description: 'All auth tasks',
        created_by: 'human',
      });

      expect(story.id).toBe('STORY-1');
      expect(story.title).toBe('Authentication Epic');
      expect(story.tasks).toEqual([]);
      expect(story.archived).toBe(false);
      expect(story.execution.archived_task_ids).toEqual([]);

      // Verify YAML
      const { data } = reader.readStory('STORY-1');
      expect(data).not.toBeNull();
      expect(data!.title).toBe('Authentication Epic');

      // Verify DB
      const db = getDb(mark2Dir);
      const row = db.select().from(stories).where(eq(stories.id, 'STORY-1')).get();
      expect(row).toBeDefined();
      expect(row!.title).toBe('Authentication Epic');
    });

    it('creates sequential story IDs', async () => {
      const s1 = await storyService.create({ title: 'Story A', description: 'desc', created_by: 'human' });
      const s2 = await storyService.create({ title: 'Story B', description: 'desc', created_by: 'human' });

      expect(s1.id).toBe('STORY-1');
      expect(s2.id).toBe('STORY-2');
    });
  });

  describe('getById', () => {
    it('returns story by ID', async () => {
      await storyService.create({ title: 'Test story', description: 'desc', created_by: 'human' });

      const story = storyService.getById('STORY-1');
      expect(story).not.toBeNull();
      expect(story!.title).toBe('Test story');
    });

    it('returns null for non-existent story', () => {
      const story = storyService.getById('STORY-999');
      expect(story).toBeNull();
    });
  });

  describe('update', () => {
    it('updates story title', async () => {
      await storyService.create({ title: 'Original', description: 'desc', created_by: 'human' });

      const updated = await storyService.update('STORY-1', { title: 'Updated' });
      expect(updated.title).toBe('Updated');

      // Check YAML
      const { data } = reader.readStory('STORY-1');
      expect(data!.title).toBe('Updated');

      // Check DB
      const db = getDb(mark2Dir);
      const row = db.select().from(stories).where(eq(stories.id, 'STORY-1')).get();
      expect(row!.title).toBe('Updated');
    });

    it('throws for non-existent story', async () => {
      await expect(storyService.update('STORY-999', { title: 'x' })).rejects.toThrow('STORY-999 not found');
    });
  });

  describe('delete', () => {
    it('removes story from both YAML and DB', async () => {
      await storyService.create({ title: 'To delete', description: 'desc', created_by: 'human' });

      await storyService.delete('STORY-1');

      // YAML gone
      const yamlPath = path.join(mark2Dir, 'stories', 'STORY-1.yaml');
      expect(existsSync(yamlPath)).toBe(false);

      // DB gone
      const db = getDb(mark2Dir);
      const row = db.select().from(stories).where(eq(stories.id, 'STORY-1')).get();
      expect(row).toBeUndefined();
    });
  });

  describe('addTask / removeTask', () => {
    it('adds a task to a story', async () => {
      await storyService.create({ title: 'Story', description: 'desc', created_by: 'human' });

      const updated = await storyService.addTask('STORY-1', 'TASK-1');
      expect(updated.tasks).toContain('TASK-1');
    });

    it('does not duplicate task references', async () => {
      await storyService.create({ title: 'Story', description: 'desc', created_by: 'human' });

      await storyService.addTask('STORY-1', 'TASK-1');
      const updated = await storyService.addTask('STORY-1', 'TASK-1');
      expect(updated.tasks.filter((t: string) => t === 'TASK-1')).toHaveLength(1);
    });

    it('removes a task from a story', async () => {
      await storyService.create({ title: 'Story', description: 'desc', created_by: 'human' });
      await storyService.addTask('STORY-1', 'TASK-1');
      await storyService.addTask('STORY-1', 'TASK-2');

      const updated = await storyService.removeTask('STORY-1', 'TASK-1');
      expect(updated.tasks).toEqual(['TASK-2']);
    });

    it('task changes are persisted in YAML', async () => {
      await storyService.create({ title: 'Story', description: 'desc', created_by: 'human' });
      await storyService.addTask('STORY-1', 'TASK-1');

      const { data } = reader.readStory('STORY-1');
      expect(data!.tasks).toContain('TASK-1');
    });

    it('throws for non-existent story', async () => {
      await expect(storyService.addTask('STORY-999', 'TASK-1')).rejects.toThrow();
      await expect(storyService.removeTask('STORY-999', 'TASK-1')).rejects.toThrow();
    });
  });

  describe('deriveStatus / getStatus', () => {
    it('returns pending for story with no tasks', async () => {
      await storyService.create({ title: 'Empty story', description: 'desc', created_by: 'human' });

      const status = storyService.getStatus('STORY-1');
      expect(status).toBe('pending');
    });

    it('returns pending when all tasks are pending', async () => {
      await storyService.create({ title: 'Story', description: 'desc', created_by: 'human' });
      await taskService.create({ title: 'Task A', description: 'desc', created_by: 'human' });
      await taskService.create({ title: 'Task B', description: 'desc', created_by: 'human' });
      await storyService.addTask('STORY-1', 'TASK-1');
      await storyService.addTask('STORY-1', 'TASK-2');

      const status = storyService.getStatus('STORY-1');
      expect(status).toBe('pending');
    });

    it('returns in_progress when some tasks are in non-pending/non-done phase', async () => {
      await storyService.create({ title: 'Story', description: 'desc', created_by: 'human' });
      await taskService.create({ title: 'Task A', description: 'desc', created_by: 'human' });
      await taskService.create({ title: 'Task B', description: 'desc', created_by: 'human' });
      await storyService.addTask('STORY-1', 'TASK-1');
      await storyService.addTask('STORY-1', 'TASK-2');

      // Move one task to coding
      await taskService.transitionPhase('TASK-1', 'coding');

      const status = storyService.getStatus('STORY-1');
      expect(status).toBe('in_progress');
    });

    it('returns completed when all tasks are done', async () => {
      await storyService.create({ title: 'Story', description: 'desc', created_by: 'human' });
      await taskService.create({ title: 'Task A', description: 'desc', created_by: 'human' });
      await taskService.create({ title: 'Task B', description: 'desc', created_by: 'human' });
      await storyService.addTask('STORY-1', 'TASK-1');
      await storyService.addTask('STORY-1', 'TASK-2');

      await taskService.transitionPhase('TASK-1', 'done');
      await taskService.transitionPhase('TASK-2', 'done');

      const status = storyService.getStatus('STORY-1');
      expect(status).toBe('completed');
    });

    it('returns in_progress when mix of done and pending', async () => {
      await storyService.create({ title: 'Story', description: 'desc', created_by: 'human' });
      await taskService.create({ title: 'Task A', description: 'desc', created_by: 'human' });
      await taskService.create({ title: 'Task B', description: 'desc', created_by: 'human' });
      await storyService.addTask('STORY-1', 'TASK-1');
      await storyService.addTask('STORY-1', 'TASK-2');

      await taskService.transitionPhase('TASK-1', 'done');
      // TASK-2 remains pending

      const status = storyService.getStatus('STORY-1');
      // done counts as "anyStarted", so it should be in_progress
      expect(status).toBe('in_progress');
    });

    it('throws for non-existent story', () => {
      expect(() => storyService.getStatus('STORY-999')).toThrow();
    });
  });

  describe('list', () => {
    it('returns active stories by default', async () => {
      await storyService.create({ title: 'Story A', description: 'desc', created_by: 'human' });
      await storyService.create({ title: 'Story B', description: 'desc', created_by: 'human' });
      await storyService.update('STORY-2', { archived: true, archived_at: new Date().toISOString() });

      const result = storyService.list();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('STORY-1');
    });

    it('includes derived status in list results', async () => {
      await storyService.create({ title: 'Empty story', description: 'desc', created_by: 'human' });

      const result = storyService.list();
      expect(result[0].status).toBe('pending');
    });

    it('filters by status', async () => {
      await storyService.create({ title: 'Empty', description: 'desc', created_by: 'human' });
      await storyService.create({ title: 'With tasks', description: 'desc', created_by: 'human' });

      // Add a task in coding to make STORY-2 "in_progress"
      await taskService.create({ title: 'Task', description: 'desc', created_by: 'human' });
      await storyService.addTask('STORY-2', 'TASK-1');
      await taskService.transitionPhase('TASK-1', 'coding');

      const pending = storyService.list({ status: 'pending' });
      expect(pending).toHaveLength(1);
      expect(pending[0].title).toBe('Empty');

      const inProgress = storyService.list({ status: 'in_progress' });
      expect(inProgress).toHaveLength(1);
      expect(inProgress[0].title).toBe('With tasks');
    });

    it('filters by archived state', async () => {
      await storyService.create({ title: 'Active story', description: 'desc', created_by: 'human' });
      await storyService.create({ title: 'Archived story', description: 'desc', created_by: 'human' });
      await storyService.update('STORY-2', { archived: true, archived_at: new Date().toISOString() });

      const archived = storyService.list({ archived: true });
      expect(archived).toHaveLength(1);
      expect(archived[0].id).toBe('STORY-2');
    });
  });

  describe('archive / restore', () => {
    it('archives a completed story and its active tasks', async () => {
      const story = await storyService.create({ title: 'Story', description: 'desc', created_by: 'human' });
      const taskA = await taskService.create({ title: 'Task A', description: 'desc', created_by: 'human' });
      const taskB = await taskService.create({ title: 'Task B', description: 'desc', created_by: 'human' });

      await storyService.addTask(story.id, taskA.id);
      await storyService.addTask(story.id, taskB.id);
      await taskService.transitionPhase(taskA.id, 'done');
      await taskService.transitionPhase(taskB.id, 'done');

      const result = await storyService.archive(story.id);

      expect(result.archived_task_ids).toEqual([taskA.id, taskB.id]);
      expect(result.story.archived).toBe(true);
      expect(result.story.execution.archived_task_ids).toEqual([taskA.id, taskB.id]);
      expect(taskService.getById(taskA.id)?.archived).toBe(true);
      expect(taskService.getById(taskB.id)?.archived).toBe(true);

      const db = getDb(mark2Dir);
      const row = db.select().from(stories).where(eq(stories.id, story.id)).get();
      expect(row?.archived).toBe(true);

      const { data } = reader.readStory(story.id);
      expect(data?.archived).toBe(true);
      expect(data?.execution.archived_task_ids).toEqual([taskA.id, taskB.id]);
    });

    it('restores only tasks archived by the story archive action', async () => {
      const story = await storyService.create({ title: 'Story', description: 'desc', created_by: 'human' });
      const taskA = await taskService.create({ title: 'Task A', description: 'desc', created_by: 'human' });
      const taskB = await taskService.create({ title: 'Task B', description: 'desc', created_by: 'human' });

      await storyService.addTask(story.id, taskA.id);
      await storyService.addTask(story.id, taskB.id);
      await taskService.transitionPhase(taskA.id, 'done');
      await taskService.transitionPhase(taskB.id, 'done');
      await taskService.archive(taskB.id);

      const archived = await storyService.archive(story.id);
      expect(archived.archived_task_ids).toEqual([taskA.id]);

      const restored = await storyService.restore(story.id);
      expect(restored.restored_task_ids).toEqual([taskA.id]);
      expect(restored.story.archived).toBe(false);
      expect(restored.story.execution.archived_task_ids).toEqual([]);
      expect(taskService.getById(taskA.id)?.archived).toBe(false);
      expect(taskService.getById(taskB.id)?.archived).toBe(true);
    });

    it('rejects archiving an incomplete story', async () => {
      const story = await storyService.create({ title: 'Story', description: 'desc', created_by: 'human' });
      const task = await taskService.create({ title: 'Task', description: 'desc', created_by: 'human' });
      await storyService.addTask(story.id, task.id);

      await expect(storyService.archive(story.id)).rejects.toThrow('completed');
    });

    it('rejects adding tasks to an archived story', async () => {
      const story = await storyService.create({ title: 'Story', description: 'desc', created_by: 'human' });
      await storyService.update(story.id, { archived: true, archived_at: new Date().toISOString() });

      await expect(storyService.addTask(story.id, 'TASK-1')).rejects.toThrow('archived');
    });
  });
});
