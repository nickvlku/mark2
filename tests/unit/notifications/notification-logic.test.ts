/**
 * Unit tests for notification logic (without browser APIs)
 *
 * These tests verify the core logic for determining when tasks need attention.
 * Full browser notification functionality is tested in E2E tests.
 */

import { describe, it, expect } from 'vitest';
import type { Task, SessionStatus } from '@/types';
import { TaskSchema } from '@/lib/yaml/schemas';
import {
  taskNeedsAttention,
  getAttentionReason,
  DEFAULT_MAX_LOOP_COUNT,
} from '@/hooks/useNotifications';

type NotificationTask = Task & { session_status?: SessionStatus };

const NOW = '2026-01-01T00:00:00.000Z';

function makeTask(overrides: Partial<NotificationTask> = {}): NotificationTask {
  const { session_status, ...taskOverrides } = overrides;

  const task = TaskSchema.parse({
    id: 'TASK-1',
    title: 'Test',
    description: 'Test',
    phase: 'coding',
    priority: 'P2',
    blockers: [],
    created_by: 'test@example.com',
    created_at: NOW,
    updated_at: NOW,
    phase_entered_at: NOW,
    ...taskOverrides,
  });

  if (session_status === undefined) {
    return task;
  }

  return {
    ...task,
    session_status,
  };
}

describe('Notification Logic', () => {
  it('exports the expected default loop threshold', () => {
    expect(DEFAULT_MAX_LOOP_COUNT).toBe(5);
  });

  describe('taskNeedsAttention', () => {
    it('returns true for completed task awaiting approval', () => {
      const task = makeTask({
        phase: 'code_review',
        session_status: 'completed',
        auto_approve: false,
      });

      expect(taskNeedsAttention(task)).toBe(true);
    });

    it('returns false for completed task with auto_approve enabled', () => {
      const task = makeTask({
        phase: 'code_review',
        session_status: 'completed',
        auto_approve: true,
      });

      expect(taskNeedsAttention(task)).toBe(false);
    });

    it('returns true for failed task', () => {
      const task = makeTask({ session_status: 'failed' });

      expect(taskNeedsAttention(task)).toBe(true);
    });

    it('returns true for blocked task', () => {
      const task = makeTask({ phase: 'design', blockers: ['TASK-1', 'TASK-2'] });

      expect(taskNeedsAttention(task)).toBe(true);
    });

    it('returns true for stuck task (exceeds loop count)', () => {
      const task = makeTask({ loop_count: 6 });

      expect(taskNeedsAttention(task, 5)).toBe(true);
    });

    it('returns false for stuck task below threshold', () => {
      const task = makeTask({ loop_count: 4 });

      expect(taskNeedsAttention(task, 5)).toBe(false);
    });

    it('returns false for task in progress', () => {
      const task = makeTask({ session_status: 'running' });

      expect(taskNeedsAttention(task)).toBe(false);
    });

    it('uses custom max loop count', () => {
      const task = makeTask({ id: 'TASK-6', loop_count: 8 });

      expect(taskNeedsAttention(task, 10)).toBe(false);
      expect(taskNeedsAttention(task, 5)).toBe(true);
    });
  });

  describe('getAttentionReason', () => {
    it('returns awaiting_approval for completed task without auto_approve', () => {
      const task = makeTask({
        phase: 'code_review',
        session_status: 'completed',
        auto_approve: false,
      });

      expect(getAttentionReason(task)).toBe('awaiting_approval');
    });

    it('returns failed for failed task', () => {
      const task = makeTask({ id: 'TASK-2', session_status: 'failed' });

      expect(getAttentionReason(task)).toBe('failed');
    });

    it('returns blocked for task with blockers', () => {
      const task = makeTask({ id: 'TASK-3', phase: 'design', blockers: ['TASK-1'] });

      expect(getAttentionReason(task)).toBe('blocked');
    });

    it('returns stuck for task exceeding loop count', () => {
      const task = makeTask({ id: 'TASK-4', loop_count: 6 });

      expect(getAttentionReason(task, 5)).toBe('stuck');
    });

    it('returns null for task not needing attention', () => {
      const task = makeTask({ id: 'TASK-5', session_status: 'running' });

      expect(getAttentionReason(task)).toBeNull();
    });

    it('prioritizes awaiting_approval over other reasons', () => {
      const task = makeTask({
        id: 'TASK-6',
        phase: 'code_review',
        session_status: 'completed',
        auto_approve: false,
        blockers: ['TASK-1'],
        loop_count: 10,
      });

      expect(getAttentionReason(task)).toBe('awaiting_approval');
    });

    it('prioritizes failed over blocked/stuck', () => {
      const task = makeTask({
        id: 'TASK-7',
        session_status: 'failed',
        blockers: ['TASK-1'],
        loop_count: 10,
      });

      expect(getAttentionReason(task)).toBe('failed');
    });

    it('prioritizes blocked over stuck', () => {
      const task = makeTask({
        id: 'TASK-8',
        phase: 'design',
        blockers: ['TASK-1'],
        loop_count: 10,
      });

      expect(getAttentionReason(task)).toBe('blocked');
    });
  });

  describe('Edge cases', () => {
    it('handles task without session_status', () => {
      const task = makeTask({ id: 'TASK-9', phase: 'design' });

      expect(taskNeedsAttention(task)).toBe(false);
    });

    it('handles task without loop_count', () => {
      const task = makeTask({ id: 'TASK-10' });

      expect(taskNeedsAttention(task)).toBe(false);
    });

    it('handles empty blockers array', () => {
      const task = makeTask({ id: 'TASK-11', phase: 'design', blockers: [] });

      expect(taskNeedsAttention(task)).toBe(false);
    });

    it('handles loop_count exactly at threshold', () => {
      const task = makeTask({ id: 'TASK-12', loop_count: 5 });

      expect(taskNeedsAttention(task, 5)).toBe(true);
    });

    it('handles loop_count of 0', () => {
      const task = makeTask({ id: 'TASK-13', loop_count: 0 });

      expect(taskNeedsAttention(task, 5)).toBe(false);
    });
  });
});
