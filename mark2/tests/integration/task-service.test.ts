import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { initializeDatabase, closeDb, getDb } from '@/lib/db';
import { tasks, activityEntries } from '@/lib/db/schema';
import { TaskService } from '@/lib/services/task-service';
import { YamlReader } from '@/lib/yaml/reader';
import { eq } from 'drizzle-orm';

let mark2Dir: string;
let taskService: TaskService;
let reader: YamlReader;

beforeEach(() => {
  mark2Dir = mkdtempSync(path.join(os.tmpdir(), 'mark2-test-'));
  mkdirSync(path.join(mark2Dir, 'tasks'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'stories'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'activity'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'artifacts'), { recursive: true });
  initializeDatabase(mark2Dir);
  taskService = new TaskService(mark2Dir);
  reader = new YamlReader(mark2Dir);
});

afterEach(() => {
  closeDb();
  rmSync(mark2Dir, { recursive: true, force: true });
});

describe('TaskService', () => {
  describe('create', () => {
    it('creates a task in both YAML and DB', () => {
      const task = taskService.create({
        title: 'Build login page',
        description: 'Create the login page with form validation',
        priority: 'P1',
        created_by: 'human',
      });

      expect(task.id).toBe('TASK-1');
      expect(task.title).toBe('Build login page');
      expect(task.phase).toBe('pending');
      expect(task.priority).toBe('P1');

      // Verify YAML
      const { data } = reader.readTask('TASK-1');
      expect(data).not.toBeNull();
      expect(data!.title).toBe('Build login page');

      // Verify DB
      const db = getDb(mark2Dir);
      const row = db.select().from(tasks).where(eq(tasks.id, 'TASK-1')).get();
      expect(row).toBeDefined();
      expect(row!.title).toBe('Build login page');
      expect(row!.priority).toBe('P1');
    });

    it('creates sequential task IDs', () => {
      const t1 = taskService.create({ title: 'Task A', description: 'desc', created_by: 'human' });
      const t2 = taskService.create({ title: 'Task B', description: 'desc', created_by: 'human' });

      expect(t1.id).toBe('TASK-1');
      expect(t2.id).toBe('TASK-2');
    });

    it('initializes activity log for new task', () => {
      taskService.create({ title: 'Task', description: 'desc', created_by: 'human' });

      const { data } = reader.readActivity('TASK-1');
      expect(data).not.toBeNull();
      expect(data!.task_id).toBe('TASK-1');
      expect(data!.entries).toEqual([]);
    });

    it('applies default values', () => {
      const task = taskService.create({ title: 'Task', description: 'desc', created_by: 'human' });

      expect(task.phase).toBe('pending');
      expect(task.priority).toBe('P2');
      expect(task.blockers).toEqual([]);
      expect(task.assigned_agents).toEqual([]);
    });
  });

  describe('getById', () => {
    it('returns task by ID', () => {
      taskService.create({ title: 'Test task', description: 'desc', created_by: 'human' });

      const task = taskService.getById('TASK-1');
      expect(task).not.toBeNull();
      expect(task!.title).toBe('Test task');
    });

    it('returns null for non-existent task', () => {
      const task = taskService.getById('TASK-999');
      expect(task).toBeNull();
    });
  });

  describe('list', () => {
    beforeEach(() => {
      taskService.create({ title: 'Pending task', description: 'desc', created_by: 'human', priority: 'P0' });
      taskService.create({ title: 'Another pending', description: 'desc', created_by: 'human', priority: 'P1' });
    });

    it('returns all tasks with no filter', () => {
      const result = taskService.list();
      expect(result).toHaveLength(2);
    });

    it('filters by phase', () => {
      // Both tasks are pending
      const pending = taskService.list({ phase: 'pending' });
      expect(pending).toHaveLength(2);

      const coding = taskService.list({ phase: 'coding' });
      expect(coding).toHaveLength(0);
    });

    it('filters by priority', () => {
      const p0 = taskService.list({ priority: 'P0' });
      expect(p0).toHaveLength(1);
      expect(p0[0].title).toBe('Pending task');

      const p1 = taskService.list({ priority: 'P1' });
      expect(p1).toHaveLength(1);
      expect(p1[0].title).toBe('Another pending');
    });

    it('filters by blocked status', () => {
      // Add a blocker to TASK-1
      taskService.addBlocker('TASK-1', 'TASK-2');

      const blocked = taskService.list({ blocked: true });
      expect(blocked).toHaveLength(1);
      expect(blocked[0].id).toBe('TASK-1');

      const unblocked = taskService.list({ blocked: false });
      expect(unblocked).toHaveLength(1);
      expect(unblocked[0].id).toBe('TASK-2');
    });
  });

  describe('update', () => {
    it('updates task title in both YAML and DB', () => {
      taskService.create({ title: 'Original', description: 'desc', created_by: 'human' });

      const updated = taskService.update('TASK-1', { title: 'Updated Title' });
      expect(updated.title).toBe('Updated Title');

      // Check YAML
      const { data } = reader.readTask('TASK-1');
      expect(data!.title).toBe('Updated Title');

      // Check DB
      const db = getDb(mark2Dir);
      const row = db.select().from(tasks).where(eq(tasks.id, 'TASK-1')).get();
      expect(row!.title).toBe('Updated Title');
    });

    it('updates updated_at timestamp', async () => {
      const original = taskService.create({ title: 'Task', description: 'desc', created_by: 'human' });
      const originalUpdatedAt = original.updated_at;

      // Wait to ensure a different ISO timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = taskService.update('TASK-1', { description: 'new desc' });
      expect(updated.updated_at).not.toBe(originalUpdatedAt);
    });

    it('throws for non-existent task', () => {
      expect(() => taskService.update('TASK-999', { title: 'x' })).toThrow('TASK-999 not found');
    });

    it('prevents ID from being changed', () => {
      taskService.create({ title: 'Task', description: 'desc', created_by: 'human' });

      const updated = taskService.update('TASK-1', { id: 'TASK-999' } as any);
      expect(updated.id).toBe('TASK-1');
    });
  });

  describe('delete', () => {
    it('removes task from both YAML and DB', () => {
      taskService.create({ title: 'To delete', description: 'desc', created_by: 'human' });

      taskService.delete('TASK-1');

      // YAML gone
      const yamlPath = path.join(mark2Dir, 'tasks', 'TASK-1.yaml');
      expect(existsSync(yamlPath)).toBe(false);

      // DB gone
      const db = getDb(mark2Dir);
      const row = db.select().from(tasks).where(eq(tasks.id, 'TASK-1')).get();
      expect(row).toBeUndefined();
    });

    it('also removes activity YAML and DB entries', () => {
      taskService.create({ title: 'Task', description: 'desc', created_by: 'human' });
      // Transition to create activity entries
      taskService.transitionPhase('TASK-1', 'design');

      taskService.delete('TASK-1');

      // Activity YAML gone
      const activityPath = path.join(mark2Dir, 'tasks', 'TASK-1.activity.yaml');
      expect(existsSync(activityPath)).toBe(false);

      // Activity DB entries gone
      const db = getDb(mark2Dir);
      const entries = db.select().from(activityEntries).where(eq(activityEntries.task_id, 'TASK-1')).all();
      expect(entries).toHaveLength(0);
    });
  });

  describe('transitionPhase', () => {
    it('updates phase and logs activity', () => {
      taskService.create({ title: 'Task', description: 'desc', created_by: 'human' });

      const updated = taskService.transitionPhase('TASK-1', 'design');
      expect(updated.phase).toBe('design');

      // Check activity entry was created in DB
      const db = getDb(mark2Dir);
      const entries = db.select().from(activityEntries).where(eq(activityEntries.task_id, 'TASK-1')).all();
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe('phase_change');
      expect(entries[0].message).toContain('pending');
      expect(entries[0].message).toContain('design');

      // Check activity YAML was also updated
      const { data: activity } = reader.readActivity('TASK-1');
      expect(activity!.entries).toHaveLength(1);
      expect(activity!.entries[0].type).toBe('phase_change');
    });

    it('updates phase_entered_at', async () => {
      const original = taskService.create({ title: 'Task', description: 'desc', created_by: 'human' });
      const originalEnteredAt = original.phase_entered_at;

      // Wait to ensure a different ISO timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = taskService.transitionPhase('TASK-1', 'design');
      expect(updated.phase_entered_at).not.toBe(originalEnteredAt);
    });

    it('throws for non-existent task', () => {
      expect(() => taskService.transitionPhase('TASK-999', 'design')).toThrow();
    });

    it('throws for invalid phase value', () => {
      taskService.create({ title: 'Task', description: 'desc', created_by: 'human' });
      expect(() => taskService.transitionPhase('TASK-1', 'invalid_phase')).toThrow();
    });
  });

  describe('addBlocker / removeBlocker', () => {
    it('adds a blocker to a task', () => {
      taskService.create({ title: 'Task', description: 'desc', created_by: 'human' });

      const updated = taskService.addBlocker('TASK-1', 'TASK-2');
      expect(updated.blockers).toContain('TASK-2');
    });

    it('does not duplicate blockers', () => {
      taskService.create({ title: 'Task', description: 'desc', created_by: 'human' });

      taskService.addBlocker('TASK-1', 'TASK-2');
      const updated = taskService.addBlocker('TASK-1', 'TASK-2');
      expect(updated.blockers.filter((b) => b === 'TASK-2')).toHaveLength(1);
    });

    it('removes a blocker from a task', () => {
      taskService.create({ title: 'Task', description: 'desc', created_by: 'human', blockers: ['TASK-2', 'TASK-3'] });

      const updated = taskService.removeBlocker('TASK-1', 'TASK-2');
      expect(updated.blockers).toEqual(['TASK-3']);
    });

    it('addBlocker throws for non-existent task', () => {
      expect(() => taskService.addBlocker('TASK-999', 'TASK-2')).toThrow();
    });

    it('removeBlocker throws for non-existent task', () => {
      expect(() => taskService.removeBlocker('TASK-999', 'TASK-2')).toThrow();
    });

    it('blockers are persisted in YAML', () => {
      taskService.create({ title: 'Task', description: 'desc', created_by: 'human' });
      taskService.addBlocker('TASK-1', 'TASK-2');

      const { data } = reader.readTask('TASK-1');
      expect(data!.blockers).toContain('TASK-2');
    });
  });

  describe('allBlockersResolved', () => {
    it('returns true when no blockers', () => {
      taskService.create({ title: 'Task', description: 'desc', created_by: 'human' });
      expect(taskService.allBlockersResolved('TASK-1')).toBe(true);
    });

    it('returns false when blocker is not done', () => {
      taskService.create({ title: 'Blocker', description: 'desc', created_by: 'human' });
      taskService.create({ title: 'Blocked', description: 'desc', created_by: 'human', blockers: ['TASK-1'] });

      expect(taskService.allBlockersResolved('TASK-2')).toBe(false);
    });

    it('returns true when all blockers are done', () => {
      taskService.create({ title: 'Blocker', description: 'desc', created_by: 'human' });
      taskService.create({ title: 'Blocked', description: 'desc', created_by: 'human', blockers: ['TASK-1'] });

      // Transition blocker to done
      taskService.transitionPhase('TASK-1', 'done');

      expect(taskService.allBlockersResolved('TASK-2')).toBe(true);
    });
  });
});
