import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';
import { initializeDatabase, closeDb, getDb } from '@/lib/db';
import { activityEntries } from '@/lib/db/schema';
import { ActivityService } from '@/lib/services/activity-service';
import { TaskService } from '@/lib/services/task-service';
import { YamlReader } from '@/lib/yaml/reader';
import { eq } from 'drizzle-orm';

let mark2Dir: string;
let activityService: ActivityService;
let taskService: TaskService;
let reader: YamlReader;

beforeEach(() => {
  mark2Dir = mkdtempSync(path.join(os.tmpdir(), 'mark2-activity-test-'));
  mkdirSync(path.join(mark2Dir, 'tasks'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'stories'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'activity'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'artifacts'), { recursive: true });
  initializeDatabase(mark2Dir);
  // Use localOnly=true to skip git operations in tests
  activityService = new ActivityService(mark2Dir, undefined, true);
  taskService = new TaskService(mark2Dir, undefined, true);
  reader = new YamlReader(mark2Dir);
});

afterEach(() => {
  closeDb();
  rmSync(mark2Dir, { recursive: true, force: true });
});

describe('ActivityService', () => {
  describe('log', () => {
    it('creates an activity entry in both YAML and DB', async () => {
      // First create a task (which initializes activity log)
      await taskService.create({
        title: 'Test Task',
        description: 'desc',
        created_by: 'human',
      });

      const entry = await activityService.log(
        'TASK-1',
        'test-source',
        'phase_change',
        'Test message'
      );

      expect(entry.timestamp).toBeDefined();
      expect(entry.source).toBe('test-source');
      expect(entry.type).toBe('phase_change');
      expect(entry.message).toBe('Test message');

      // Verify DB entry
      const db = getDb(mark2Dir);
      const rows = db
        .select()
        .from(activityEntries)
        .where(eq(activityEntries.task_id, 'TASK-1'))
        .all();
      expect(rows.length).toBeGreaterThan(0);
      const dbEntry = rows.find((r) => r.message === 'Test message');
      expect(dbEntry).toBeDefined();
      expect(dbEntry!.source).toBe('test-source');

      // Verify YAML entry
      const { data } = reader.readActivity('TASK-1');
      expect(data).not.toBeNull();
      const yamlEntry = data!.entries.find((e) => e.message === 'Test message');
      expect(yamlEntry).toBeDefined();
    });

    it('logs multiple entries in sequence', async () => {
      await taskService.create({
        title: 'Test Task',
        description: 'desc',
        created_by: 'human',
      });

      await activityService.log('TASK-1', 'source1', 'phase_change', 'First message');
      await activityService.log('TASK-1', 'source2', 'comment', 'Second message');
      await activityService.log('TASK-1', 'source3', 'error', 'Third message');

      const entries = activityService.getForTask('TASK-1');
      expect(entries).toHaveLength(3);
    });

    it('includes metadata in activity entry', async () => {
      await taskService.create({
        title: 'Test Task',
        description: 'desc',
        created_by: 'human',
      });

      const entry = await activityService.log(
        'TASK-1',
        'test-source',
        'phase_change',
        'Test message',
        { key: 'value', nested: { data: true } }
      );

      expect(entry.metadata).toBeDefined();
      expect(entry.metadata!.key).toBe('value');
      expect((entry.metadata!.nested as { data: boolean }).data).toBe(true);
    });

    it('supports different entry types', async () => {
      await taskService.create({
        title: 'Test Task',
        description: 'desc',
        created_by: 'human',
      });

      // Valid types from ActivityEntry schema: 'note' | 'phase_change' | 'artifact' | 'error' | 'comment'
      const types: Array<'phase_change' | 'comment' | 'error' | 'artifact' | 'note'> = [
        'phase_change',
        'comment',
        'error',
        'artifact',
        'note',
      ];

      for (const type of types) {
        const entry = await activityService.log('TASK-1', 'source', type, `Message for ${type}`);
        expect(entry.type).toBe(type);
      }

      const entries = activityService.getForTask('TASK-1');
      expect(entries).toHaveLength(types.length);
    });
  });

  describe('getForTask', () => {
    it('returns entries for a task', async () => {
      await taskService.create({
        title: 'Test Task',
        description: 'desc',
        created_by: 'human',
      });

      await activityService.log('TASK-1', 'source', 'comment', 'Entry 1');
      await activityService.log('TASK-1', 'source', 'comment', 'Entry 2');

      const entries = activityService.getForTask('TASK-1');
      expect(entries).toHaveLength(2);
    });

    it('respects limit parameter', async () => {
      await taskService.create({
        title: 'Test Task',
        description: 'desc',
        created_by: 'human',
      });

      for (let i = 0; i < 10; i++) {
        await activityService.log('TASK-1', 'source', 'comment', `Entry ${i}`);
      }

      const entries = activityService.getForTask('TASK-1', 5);
      expect(entries).toHaveLength(5);
    });

    it('returns empty array for task with no entries', async () => {
      await taskService.create({
        title: 'Test Task',
        description: 'desc',
        created_by: 'human',
      });

      // Task is created but no activity logged yet
      const entries = activityService.getForTask('TASK-1');
      expect(entries).toEqual([]);
    });

    it('returns empty array for non-existent task', () => {
      const entries = activityService.getForTask('NONEXISTENT');
      expect(entries).toEqual([]);
    });
  });

  // NOTE: getByType and getBySource methods are not implemented in ActivityService
  // If needed, they can be added later. For now, filtering can be done client-side
  // using the entries returned by getForTask.

  describe('Activity persistence across services', () => {
    it('activity logged by task transitions is retrievable', async () => {
      await taskService.create({
        title: 'Test Task',
        description: 'desc',
        created_by: 'human',
      });

      // Transition creates activity entry
      await taskService.transitionPhase('TASK-1', 'design');

      const entries = activityService.getForTask('TASK-1');
      expect(entries.length).toBeGreaterThan(0);

      const phaseChange = entries.find((e) => e.type === 'phase_change');
      expect(phaseChange).toBeDefined();
      expect(phaseChange!.message).toContain('pending');
      expect(phaseChange!.message).toContain('design');
    });
  });
});
