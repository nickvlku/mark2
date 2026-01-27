import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';
import { initializeDatabase, closeDb } from '@/lib/db';
import { generateTaskId, generateStoryId } from '@/lib/utils/id-generator';

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

describe('ID Generator', () => {
  describe('generateTaskId', () => {
    it('generates first task ID as TASK-1', () => {
      const id = generateTaskId(mark2Dir);
      expect(id).toBe('TASK-1');
    });

    it('generates second task ID as TASK-2', () => {
      generateTaskId(mark2Dir);
      const id = generateTaskId(mark2Dir);
      expect(id).toBe('TASK-2');
    });

    it('generates sequential IDs across multiple calls', () => {
      const ids = [];
      for (let i = 0; i < 5; i++) {
        ids.push(generateTaskId(mark2Dir));
      }
      expect(ids).toEqual(['TASK-1', 'TASK-2', 'TASK-3', 'TASK-4', 'TASK-5']);
    });
  });

  describe('generateStoryId', () => {
    it('generates first story ID as STORY-1', () => {
      const id = generateStoryId(mark2Dir);
      expect(id).toBe('STORY-1');
    });

    it('generates second story ID as STORY-2', () => {
      generateStoryId(mark2Dir);
      const id = generateStoryId(mark2Dir);
      expect(id).toBe('STORY-2');
    });

    it('generates sequential story IDs', () => {
      const ids = [];
      for (let i = 0; i < 3; i++) {
        ids.push(generateStoryId(mark2Dir));
      }
      expect(ids).toEqual(['STORY-1', 'STORY-2', 'STORY-3']);
    });
  });

  describe('Cross-entity independence', () => {
    it('task and story counters are independent', () => {
      const task1 = generateTaskId(mark2Dir);
      const story1 = generateStoryId(mark2Dir);
      const task2 = generateTaskId(mark2Dir);
      const story2 = generateStoryId(mark2Dir);

      expect(task1).toBe('TASK-1');
      expect(story1).toBe('STORY-1');
      expect(task2).toBe('TASK-2');
      expect(story2).toBe('STORY-2');
    });
  });
});
