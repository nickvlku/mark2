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
  storyService = new StoryService(mark2Dir);
  taskService = new TaskService(mark2Dir);
  reader = new YamlReader(mark2Dir);
});

afterEach(() => {
  closeDb();
  rmSync(mark2Dir, { recursive: true, force: true });
});

describe('StoryService', () => {
  describe('create', () => {
    it('creates a story in both YAML and DB', () => {
      const story = storyService.create({
        title: 'Authentication Epic',
        description: 'All auth tasks',
        created_by: 'human',
      });

      expect(story.id).toBe('STORY-1');
      expect(story.title).toBe('Authentication Epic');
      expect(story.tasks).toEqual([]);

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

    it('creates sequential story IDs', () => {
      const s1 = storyService.create({ title: 'Story A', description: 'desc', created_by: 'human' });
      const s2 = storyService.create({ title: 'Story B', description: 'desc', created_by: 'human' });

      expect(s1.id).toBe('STORY-1');
      expect(s2.id).toBe('STORY-2');
    });
  });

  describe('getById', () => {
    it('returns story by ID', () => {
      storyService.create({ title: 'Test story', description: 'desc', created_by: 'human' });

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
    it('updates story title', () => {
      storyService.create({ title: 'Original', description: 'desc', created_by: 'human' });

      const updated = storyService.update('STORY-1', { title: 'Updated' });
      expect(updated.title).toBe('Updated');

      // Check YAML
      const { data } = reader.readStory('STORY-1');
      expect(data!.title).toBe('Updated');

      // Check DB
      const db = getDb(mark2Dir);
      const row = db.select().from(stories).where(eq(stories.id, 'STORY-1')).get();
      expect(row!.title).toBe('Updated');
    });

    it('throws for non-existent story', () => {
      expect(() => storyService.update('STORY-999', { title: 'x' })).toThrow('STORY-999 not found');
    });
  });

  describe('delete', () => {
    it('removes story from both YAML and DB', () => {
      storyService.create({ title: 'To delete', description: 'desc', created_by: 'human' });

      storyService.delete('STORY-1');

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
    it('adds a task to a story', () => {
      storyService.create({ title: 'Story', description: 'desc', created_by: 'human' });

      const updated = storyService.addTask('STORY-1', 'TASK-1');
      expect(updated.tasks).toContain('TASK-1');
    });

    it('does not duplicate task references', () => {
      storyService.create({ title: 'Story', description: 'desc', created_by: 'human' });

      storyService.addTask('STORY-1', 'TASK-1');
      const updated = storyService.addTask('STORY-1', 'TASK-1');
      expect(updated.tasks.filter((t) => t === 'TASK-1')).toHaveLength(1);
    });

    it('removes a task from a story', () => {
      storyService.create({ title: 'Story', description: 'desc', created_by: 'human' });
      storyService.addTask('STORY-1', 'TASK-1');
      storyService.addTask('STORY-1', 'TASK-2');

      const updated = storyService.removeTask('STORY-1', 'TASK-1');
      expect(updated.tasks).toEqual(['TASK-2']);
    });

    it('task changes are persisted in YAML', () => {
      storyService.create({ title: 'Story', description: 'desc', created_by: 'human' });
      storyService.addTask('STORY-1', 'TASK-1');

      const { data } = reader.readStory('STORY-1');
      expect(data!.tasks).toContain('TASK-1');
    });

    it('throws for non-existent story', () => {
      expect(() => storyService.addTask('STORY-999', 'TASK-1')).toThrow();
      expect(() => storyService.removeTask('STORY-999', 'TASK-1')).toThrow();
    });
  });

  describe('deriveStatus / getStatus', () => {
    it('returns pending for story with no tasks', () => {
      storyService.create({ title: 'Empty story', description: 'desc', created_by: 'human' });

      const status = storyService.getStatus('STORY-1');
      expect(status).toBe('pending');
    });

    it('returns pending when all tasks are pending', () => {
      storyService.create({ title: 'Story', description: 'desc', created_by: 'human' });
      taskService.create({ title: 'Task A', description: 'desc', created_by: 'human' });
      taskService.create({ title: 'Task B', description: 'desc', created_by: 'human' });
      storyService.addTask('STORY-1', 'TASK-1');
      storyService.addTask('STORY-1', 'TASK-2');

      const status = storyService.getStatus('STORY-1');
      expect(status).toBe('pending');
    });

    it('returns in_progress when some tasks are in non-pending/non-done phase', () => {
      storyService.create({ title: 'Story', description: 'desc', created_by: 'human' });
      taskService.create({ title: 'Task A', description: 'desc', created_by: 'human' });
      taskService.create({ title: 'Task B', description: 'desc', created_by: 'human' });
      storyService.addTask('STORY-1', 'TASK-1');
      storyService.addTask('STORY-1', 'TASK-2');

      // Move one task to coding
      taskService.transitionPhase('TASK-1', 'coding');

      const status = storyService.getStatus('STORY-1');
      expect(status).toBe('in_progress');
    });

    it('returns completed when all tasks are done', () => {
      storyService.create({ title: 'Story', description: 'desc', created_by: 'human' });
      taskService.create({ title: 'Task A', description: 'desc', created_by: 'human' });
      taskService.create({ title: 'Task B', description: 'desc', created_by: 'human' });
      storyService.addTask('STORY-1', 'TASK-1');
      storyService.addTask('STORY-1', 'TASK-2');

      taskService.transitionPhase('TASK-1', 'done');
      taskService.transitionPhase('TASK-2', 'done');

      const status = storyService.getStatus('STORY-1');
      expect(status).toBe('completed');
    });

    it('returns in_progress when mix of done and pending', () => {
      storyService.create({ title: 'Story', description: 'desc', created_by: 'human' });
      taskService.create({ title: 'Task A', description: 'desc', created_by: 'human' });
      taskService.create({ title: 'Task B', description: 'desc', created_by: 'human' });
      storyService.addTask('STORY-1', 'TASK-1');
      storyService.addTask('STORY-1', 'TASK-2');

      taskService.transitionPhase('TASK-1', 'done');
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
    it('returns all stories', () => {
      storyService.create({ title: 'Story A', description: 'desc', created_by: 'human' });
      storyService.create({ title: 'Story B', description: 'desc', created_by: 'human' });

      const result = storyService.list();
      expect(result).toHaveLength(2);
    });

    it('includes derived status in list results', () => {
      storyService.create({ title: 'Empty story', description: 'desc', created_by: 'human' });

      const result = storyService.list();
      expect(result[0].status).toBe('pending');
    });

    it('filters by status', () => {
      storyService.create({ title: 'Empty', description: 'desc', created_by: 'human' });
      storyService.create({ title: 'With tasks', description: 'desc', created_by: 'human' });

      // Add a task in coding to make STORY-2 "in_progress"
      taskService.create({ title: 'Task', description: 'desc', created_by: 'human' });
      storyService.addTask('STORY-2', 'TASK-1');
      taskService.transitionPhase('TASK-1', 'coding');

      const pending = storyService.list({ status: 'pending' });
      expect(pending).toHaveLength(1);
      expect(pending[0].title).toBe('Empty');

      const inProgress = storyService.list({ status: 'in_progress' });
      expect(inProgress).toHaveLength(1);
      expect(inProgress[0].title).toBe('With tasks');
    });
  });
});
