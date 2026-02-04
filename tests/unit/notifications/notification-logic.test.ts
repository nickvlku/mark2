/**
 * Unit tests for notification logic (without browser APIs)
 *
 * These tests verify the core logic for determining when tasks need attention.
 * Full browser notification functionality is tested in E2E tests.
 */

import { describe, it, expect } from 'vitest';
import type { Task } from '@/types';
import {
  taskNeedsAttention,
  getAttentionReason,
  DEFAULT_MAX_LOOP_COUNT,
} from '@/hooks/useNotifications';

describe('Notification Logic', () => {
  describe('taskNeedsAttention', () => {
    it('returns true for completed task awaiting approval', () => {
      const task: Task = {
        id: 'TASK-1',
        title: 'Test',
        description: 'Test',
        phase: 'review',
        priority: 'P2',
        session_status: 'completed',
        auto_approve: false,
        blockers: [],
      } as Task;

      expect(taskNeedsAttention(task)).toBe(true);
    });

    it('returns false for completed task with auto_approve enabled', () => {
      const task: Task = {
        id: 'TASK-1',
        title: 'Test',
        description: 'Test',
        phase: 'review',
        priority: 'P2',
        session_status: 'completed',
        auto_approve: true,
        blockers: [],
      } as Task;

      expect(taskNeedsAttention(task)).toBe(false);
    });

    it('returns true for failed task', () => {
      const task: Task = {
        id: 'TASK-2',
        title: 'Test',
        description: 'Test',
        phase: 'coding',
        priority: 'P2',
        session_status: 'failed',
        blockers: [],
      } as Task;

      expect(taskNeedsAttention(task)).toBe(true);
    });

    it('returns true for blocked task', () => {
      const task: Task = {
        id: 'TASK-3',
        title: 'Test',
        description: 'Test',
        phase: 'design',
        priority: 'P2',
        blockers: ['TASK-1', 'TASK-2'],
      } as Task;

      expect(taskNeedsAttention(task)).toBe(true);
    });

    it('returns true for stuck task (exceeds loop count)', () => {
      const task: Task = {
        id: 'TASK-4',
        title: 'Test',
        description: 'Test',
        phase: 'coding',
        priority: 'P2',
        loop_count: 6,
        blockers: [],
      } as Task;

      expect(taskNeedsAttention(task, 5)).toBe(true);
    });

    it('returns false for stuck task below threshold', () => {
      const task: Task = {
        id: 'TASK-4',
        title: 'Test',
        description: 'Test',
        phase: 'coding',
        priority: 'P2',
        loop_count: 4,
        blockers: [],
      } as Task;

      expect(taskNeedsAttention(task, 5)).toBe(false);
    });

    it('returns false for task in progress', () => {
      const task: Task = {
        id: 'TASK-5',
        title: 'Test',
        description: 'Test',
        phase: 'coding',
        priority: 'P2',
        session_status: 'running',
        blockers: [],
      } as Task;

      expect(taskNeedsAttention(task)).toBe(false);
    });

    it('uses custom max loop count', () => {
      const task: Task = {
        id: 'TASK-6',
        title: 'Test',
        description: 'Test',
        phase: 'coding',
        priority: 'P2',
        loop_count: 8,
        blockers: [],
      } as Task;

      expect(taskNeedsAttention(task, 10)).toBe(false);
      expect(taskNeedsAttention(task, 5)).toBe(true);
    });
  });

  describe('getAttentionReason', () => {
    it('returns awaiting_approval for completed task without auto_approve', () => {
      const task: Task = {
        id: 'TASK-1',
        title: 'Test',
        description: 'Test',
        phase: 'review',
        priority: 'P2',
        session_status: 'completed',
        auto_approve: false,
        blockers: [],
      } as Task;

      expect(getAttentionReason(task)).toBe('awaiting_approval');
    });

    it('returns failed for failed task', () => {
      const task: Task = {
        id: 'TASK-2',
        title: 'Test',
        description: 'Test',
        phase: 'coding',
        priority: 'P2',
        session_status: 'failed',
        blockers: [],
      } as Task;

      expect(getAttentionReason(task)).toBe('failed');
    });

    it('returns blocked for task with blockers', () => {
      const task: Task = {
        id: 'TASK-3',
        title: 'Test',
        description: 'Test',
        phase: 'design',
        priority: 'P2',
        blockers: ['TASK-1'],
      } as Task;

      expect(getAttentionReason(task)).toBe('blocked');
    });

    it('returns stuck for task exceeding loop count', () => {
      const task: Task = {
        id: 'TASK-4',
        title: 'Test',
        description: 'Test',
        phase: 'coding',
        priority: 'P2',
        loop_count: 6,
        blockers: [],
      } as Task;

      expect(getAttentionReason(task, 5)).toBe('stuck');
    });

    it('returns null for task not needing attention', () => {
      const task: Task = {
        id: 'TASK-5',
        title: 'Test',
        description: 'Test',
        phase: 'coding',
        priority: 'P2',
        session_status: 'running',
        blockers: [],
      } as Task;

      expect(getAttentionReason(task)).toBeNull();
    });

    it('prioritizes awaiting_approval over other reasons', () => {
      const task: Task = {
        id: 'TASK-6',
        title: 'Test',
        description: 'Test',
        phase: 'review',
        priority: 'P2',
        session_status: 'completed',
        auto_approve: false,
        blockers: ['TASK-1'], // Also blocked
        loop_count: 10, // Also stuck
      } as Task;

      expect(getAttentionReason(task)).toBe('awaiting_approval');
    });

    it('prioritizes failed over blocked/stuck', () => {
      const task: Task = {
        id: 'TASK-7',
        title: 'Test',
        description: 'Test',
        phase: 'coding',
        priority: 'P2',
        session_status: 'failed',
        blockers: ['TASK-1'], // Also blocked
        loop_count: 10, // Also stuck
      } as Task;

      expect(getAttentionReason(task)).toBe('failed');
    });

    it('prioritizes blocked over stuck', () => {
      const task: Task = {
        id: 'TASK-8',
        title: 'Test',
        description: 'Test',
        phase: 'design',
        priority: 'P2',
        blockers: ['TASK-1'], // Blocked
        loop_count: 10, // Also stuck
      } as Task;

      expect(getAttentionReason(task)).toBe('blocked');
    });
  });

  describe('Edge cases', () => {
    it('handles task without session_status', () => {
      const task: Task = {
        id: 'TASK-9',
        title: 'Test',
        description: 'Test',
        phase: 'design',
        priority: 'P2',
        blockers: [],
      } as Task;

      expect(taskNeedsAttention(task)).toBe(false);
    });

    it('handles task without loop_count', () => {
      const task: Task = {
        id: 'TASK-10',
        title: 'Test',
        description: 'Test',
        phase: 'coding',
        priority: 'P2',
        blockers: [],
      } as Task;

      expect(taskNeedsAttention(task)).toBe(false);
    });

    it('handles empty blockers array', () => {
      const task: Task = {
        id: 'TASK-11',
        title: 'Test',
        description: 'Test',
        phase: 'design',
        priority: 'P2',
        blockers: [],
      } as Task;

      expect(taskNeedsAttention(task)).toBe(false);
    });

    it('handles loop_count exactly at threshold', () => {
      const task: Task = {
        id: 'TASK-12',
        title: 'Test',
        description: 'Test',
        phase: 'coding',
        priority: 'P2',
        loop_count: 5,
        blockers: [],
      } as Task;

      expect(taskNeedsAttention(task, 5)).toBe(true);
    });

    it('handles loop_count of 0', () => {
      const task: Task = {
        id: 'TASK-13',
        title: 'Test',
        description: 'Test',
        phase: 'coding',
        priority: 'P2',
        loop_count: 0,
        blockers: [],
      } as Task;

      expect(taskNeedsAttention(task, 5)).toBe(false);
    });
  });
});
