import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';
import { YamlReader } from '@/lib/yaml/reader';
import { YamlWriter } from '@/lib/yaml/writer';
import type { Task, Story, ActivityLog } from '@/lib/yaml/schemas';

const NOW = '2025-01-15T10:00:00.000Z';

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Description for ${id}`,
    phase: 'pending',
    phase_agents: {},
    phase_overrides: {},
    blockers: [],
    priority: 'P2',
    artifacts: [],
    ports: [],
    worktrees: {},
    created_by: 'human',
    merge_strategy: 'squash',
    auto_advance: true,
    auto_approve: false,
    created_at: NOW,
    updated_at: NOW,
    phase_entered_at: NOW,
    loop_count: 0,
    archived: false,
    ...overrides,
  };
}

function makeStory(id: string, overrides: Partial<Story> = {}): Story {
  return {
    id,
    title: `Story ${id}`,
    description: `Description for ${id}`,
    tasks: [],
    execution: {
      status: 'idle',
      base_branch: 'main',
      target_branch: 'main',
      task_merge_failures: [],
    },
    created_by: 'human',
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

let mark2Dir: string;
let reader: YamlReader;
let writer: YamlWriter;

beforeEach(() => {
  mark2Dir = mkdtempSync(path.join(os.tmpdir(), 'mark2-test-'));
  mkdirSync(path.join(mark2Dir, 'tasks'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'stories'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'activity'), { recursive: true });
  reader = new YamlReader(mark2Dir);
  writer = new YamlWriter(mark2Dir);
});

afterEach(() => {
  rmSync(mark2Dir, { recursive: true, force: true });
});

describe('YAML Roundtrip', () => {
  // ── Tasks ───────────────────────────────────────────────────────────
  describe('Task roundtrip', () => {
    it('writes a task and reads it back with all fields intact', () => {
      const task = makeTask('TASK-1', {
        title: 'Implement auth',
        description: 'Build authentication system',
        phase: 'coding',
        priority: 'P0',
        phase_agents: { design: 'design-agent', coding: 'coding-agent' },
        blockers: ['TASK-2'],
        ports: [3010, 3011],
        worktrees: { 'coding-agent': '/tmp/worktree' },
        story_id: 'STORY-1',
        loop_count: 2,
        merge_strategy: 'preserve',
      });

      writer.writeTask(task);
      const { data, error } = reader.readTask('TASK-1');

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.id).toBe('TASK-1');
      expect(data!.title).toBe('Implement auth');
      expect(data!.description).toBe('Build authentication system');
      expect(data!.phase).toBe('coding');
      expect(data!.priority).toBe('P0');
      expect(data!.phase_agents).toEqual({ design: 'design-agent', coding: 'coding-agent' });
      expect(data!.blockers).toEqual(['TASK-2']);
      expect(data!.ports).toEqual([3010, 3011]);
      expect(data!.worktrees).toEqual({ 'coding-agent': '/tmp/worktree' });
      expect(data!.story_id).toBe('STORY-1');
      expect(data!.loop_count).toBe(2);
      expect(data!.merge_strategy).toBe('preserve');
      expect(data!.created_at).toBe(NOW);
    });

    it('readAllTasks returns all written tasks', () => {
      writer.writeTask(makeTask('TASK-1'));
      writer.writeTask(makeTask('TASK-2'));
      writer.writeTask(makeTask('TASK-3'));

      const { tasks, errors } = reader.readAllTasks();
      expect(errors).toHaveLength(0);
      expect(tasks).toHaveLength(3);
      const ids = tasks.map((t) => t.id).sort();
      expect(ids).toEqual(['TASK-1', 'TASK-2', 'TASK-3']);
    });

    it('readTask for non-existent ID returns error', () => {
      const { data, error } = reader.readTask('TASK-999');
      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error!.error).toContain('not found');
    });

    it('readAllTasks on empty directory returns empty', () => {
      const { tasks, errors } = reader.readAllTasks();
      expect(tasks).toHaveLength(0);
      expect(errors).toHaveLength(0);
    });
  });

  // ── Stories ─────────────────────────────────────────────────────────
  describe('Story roundtrip', () => {
    it('writes a story and reads it back', () => {
      const story = makeStory('STORY-1', {
        title: 'Auth Epic',
        description: 'All authentication tasks',
        tasks: ['TASK-1', 'TASK-2'],
      });

      writer.writeStory(story);
      const { data, error } = reader.readStory('STORY-1');

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.id).toBe('STORY-1');
      expect(data!.title).toBe('Auth Epic');
      expect(data!.tasks).toEqual(['TASK-1', 'TASK-2']);
    });

    it('readAllStories returns all written stories', () => {
      writer.writeStory(makeStory('STORY-1'));
      writer.writeStory(makeStory('STORY-2'));

      const { stories, errors } = reader.readAllStories();
      expect(errors).toHaveLength(0);
      expect(stories).toHaveLength(2);
    });

    it('readStory for non-existent returns error', () => {
      const { data, error } = reader.readStory('STORY-999');
      expect(data).toBeNull();
      expect(error).not.toBeNull();
    });
  });

  // ── Activity Log ────────────────────────────────────────────────────
  describe('Activity log roundtrip', () => {
    it('writes and reads an activity log', () => {
      const activity: ActivityLog = {
        task_id: 'TASK-1',
        entries: [
          {
            timestamp: NOW,
            source: 'system',
            type: 'phase_change',
            message: 'Phase changed to design',
            metadata: { old_phase: 'pending', new_phase: 'design' },
          },
          {
            timestamp: NOW,
            source: 'agent',
            type: 'note',
            message: 'Design started',
          },
        ],
      };

      writer.writeActivity(activity);
      const { data, error } = reader.readActivity('TASK-1');

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.task_id).toBe('TASK-1');
      expect(data!.entries).toHaveLength(2);
      expect(data!.entries[0].type).toBe('phase_change');
      expect(data!.entries[0].metadata).toEqual({ old_phase: 'pending', new_phase: 'design' });
      expect(data!.entries[1].type).toBe('note');
    });
  });

  // ── Validation on write ─────────────────────────────────────────────
  describe('Write validation', () => {
    it('writing task with invalid data fails validation', () => {
      const badTask = {
        id: 'bad-id', // Invalid format
        title: 'Task',
        description: 'desc',
        phase: 'pending',
        phase_agents: {},
        phase_overrides: {},
        blockers: [],
        priority: 'P2',
        artifacts: [],
        ports: [],
        worktrees: {},
        created_by: 'human',
        merge_strategy: 'squash',
        auto_advance: true,
        auto_approve: false,
        created_at: NOW,
        updated_at: NOW,
        phase_entered_at: NOW,
        loop_count: 0,
      } as any;

      expect(() => writer.writeTask(badTask)).toThrow();
    });

    it('writing story with invalid data fails validation', () => {
      const badStory = {
        id: 'BAD',
        title: 'Story',
        description: 'desc',
        created_by: 'human',
        created_at: NOW,
        updated_at: NOW,
      } as any;

      expect(() => writer.writeStory(badStory)).toThrow();
    });
  });

  // ── Delete ──────────────────────────────────────────────────────────
  describe('Delete operations', () => {
    it('deleteTask removes the YAML file', () => {
      writer.writeTask(makeTask('TASK-1'));
      writer.deleteTask('TASK-1');
      const { data } = reader.readTask('TASK-1');
      expect(data).toBeNull();
    });

    it('deleteStory removes the YAML file', () => {
      writer.writeStory(makeStory('STORY-1'));
      writer.deleteStory('STORY-1');
      const { data } = reader.readStory('STORY-1');
      expect(data).toBeNull();
    });
  });
});
