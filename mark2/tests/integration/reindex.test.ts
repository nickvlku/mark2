import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';
import { initializeDatabase, closeDb, getDb } from '@/lib/db';
import { tasks, stories, activityEntries, idCounters } from '@/lib/db/schema';
import { ReindexService } from '@/lib/services/reindex-service';
import { eq } from 'drizzle-orm';

const NOW = '2025-01-15T10:00:00.000Z';

let mark2Dir: string;

beforeEach(() => {
  mark2Dir = mkdtempSync(path.join(os.tmpdir(), 'mark2-test-'));
  mkdirSync(path.join(mark2Dir, 'tasks'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'stories'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'activity'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'artifacts'), { recursive: true });
  initializeDatabase(mark2Dir);
});

afterEach(() => {
  closeDb();
  rmSync(mark2Dir, { recursive: true, force: true });
});

function writeTaskYaml(taskId: string, overrides: Record<string, unknown> = {}) {
  const data = {
    id: taskId,
    title: `Task ${taskId}`,
    description: `Description for ${taskId}`,
    phase: 'pending',
    assigned_agents: [],
    blockers: [],
    priority: 'P2',
    artifacts: [],
    ports: [],
    worktrees: {},
    created_by: 'human',
    merge_strategy: 'squash',
    created_at: NOW,
    updated_at: NOW,
    phase_entered_at: NOW,
    loop_count: 0,
    ...overrides,
  };
  const filePath = path.join(mark2Dir, 'tasks', `${taskId}.yaml`);
  writeFileSync(filePath, YAML.stringify(data), 'utf-8');
}

function writeStoryYaml(storyId: string, overrides: Record<string, unknown> = {}) {
  const data = {
    id: storyId,
    title: `Story ${storyId}`,
    description: `Description for ${storyId}`,
    tasks: [],
    created_by: 'human',
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
  const filePath = path.join(mark2Dir, 'stories', `${storyId}.yaml`);
  writeFileSync(filePath, YAML.stringify(data), 'utf-8');
}

function writeActivityYaml(taskId: string) {
  const data = {
    task_id: taskId,
    entries: [
      {
        timestamp: NOW,
        source: 'system',
        type: 'phase_change',
        message: 'Phase changed',
      },
    ],
  };
  const filePath = path.join(mark2Dir, 'tasks', `${taskId}.activity.yaml`);
  writeFileSync(filePath, YAML.stringify(data), 'utf-8');
}

describe('ReindexService', () => {
  describe('fullReindex', () => {
    it('indexes tasks from YAML files into SQLite', async () => {
      writeTaskYaml('TASK-1', { title: 'First task', phase: 'coding' });
      writeTaskYaml('TASK-2', { title: 'Second task', phase: 'testing' });

      const service = new ReindexService(mark2Dir);
      const result = await service.fullReindex();

      expect(result.tasks_indexed).toBe(2);
      expect(result.errors).toHaveLength(0);

      // Verify data is queryable from SQLite
      const db = getDb(mark2Dir);
      const allTasks = db.select().from(tasks).all();
      expect(allTasks).toHaveLength(2);

      const task1 = db.select().from(tasks).where(eq(tasks.id, 'TASK-1')).get();
      expect(task1).toBeDefined();
      expect(task1!.title).toBe('First task');
      expect(task1!.phase).toBe('coding');
    });

    it('indexes stories from YAML files into SQLite', async () => {
      writeStoryYaml('STORY-1', { title: 'Auth Story', tasks: ['TASK-1'] });
      writeStoryYaml('STORY-2', { title: 'API Story' });

      const service = new ReindexService(mark2Dir);
      const result = await service.fullReindex();

      expect(result.stories_indexed).toBe(2);

      const db = getDb(mark2Dir);
      const allStories = db.select().from(stories).all();
      expect(allStories).toHaveLength(2);

      const story1 = db.select().from(stories).where(eq(stories.id, 'STORY-1')).get();
      expect(story1).toBeDefined();
      expect(story1!.title).toBe('Auth Story');
    });

    it('indexes activity entries', async () => {
      writeTaskYaml('TASK-1');
      writeActivityYaml('TASK-1');

      const service = new ReindexService(mark2Dir);
      const result = await service.fullReindex();

      expect(result.activities_indexed).toBe(1);

      const db = getDb(mark2Dir);
      const entries = db.select().from(activityEntries).all();
      expect(entries).toHaveLength(1);
      expect(entries[0].task_id).toBe('TASK-1');
      expect(entries[0].type).toBe('phase_change');
    });

    it('updates ID counters based on max existing IDs', async () => {
      writeTaskYaml('TASK-5');
      writeTaskYaml('TASK-10');
      writeStoryYaml('STORY-3');

      const service = new ReindexService(mark2Dir);
      await service.fullReindex();

      const db = getDb(mark2Dir);
      const taskCounter = db.select().from(idCounters).where(eq(idCounters.entity_type, 'task')).get();
      expect(taskCounter!.next_id).toBe(11); // max TASK-10 + 1

      const storyCounter = db.select().from(idCounters).where(eq(idCounters.entity_type, 'story')).get();
      expect(storyCounter!.next_id).toBe(4); // max STORY-3 + 1
    });

    it('returns errors for corrupt YAML files', async () => {
      // Write a valid task
      writeTaskYaml('TASK-1');

      // Write corrupt YAML (invalid task ID format)
      const corruptPath = path.join(mark2Dir, 'tasks', 'TASK-2.yaml');
      writeFileSync(corruptPath, YAML.stringify({ id: 'INVALID', title: 'bad' }), 'utf-8');

      const service = new ReindexService(mark2Dir);
      const result = await service.fullReindex();

      expect(result.tasks_indexed).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('clears previous data before reindexing', async () => {
      // First reindex with 2 tasks
      writeTaskYaml('TASK-1');
      writeTaskYaml('TASK-2');

      const service = new ReindexService(mark2Dir);
      await service.fullReindex();

      let db = getDb(mark2Dir);
      expect(db.select().from(tasks).all()).toHaveLength(2);

      // Remove TASK-2 yaml and reindex
      rmSync(path.join(mark2Dir, 'tasks', 'TASK-2.yaml'));
      await service.fullReindex();

      db = getDb(mark2Dir);
      expect(db.select().from(tasks).all()).toHaveLength(1);
    });
  });
});
