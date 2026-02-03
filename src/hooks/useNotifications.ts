/**
 * useNotifications Hook
 *
 * React hook that integrates browser notification logic with task state changes.
 * Monitors tasks and triggers notifications when they need user attention.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Task, SessionStatus } from '@/types';
import { NotificationService, NotificationPermission } from '@/lib/notifications';

export interface UseNotificationsOptions {
  /** Tasks to monitor for attention-requiring states */
  tasks: Task[];
  /** Currently selected task ID (don't notify if user is viewing it) */
  selectedTaskId?: string | null;
  /** Whether the browser tab is currently focused */
  isWindowFocused?: boolean;
}

export interface UseNotificationsResult {
  /** Current browser notification permission state */
  permission: NotificationPermission;
  /** Whether notifications are enabled by user preference */
  enabled: boolean;
  /** Request notification permission (call on user action) */
  requestPermission: () => Promise<void>;
  /** Toggle enabled state */
  setEnabled: (enabled: boolean) => void;
  /** Whether the browser supports notifications */
  isSupported: boolean;
  /** Tasks that currently need attention */
  pendingAttention: Task[];
}

/**
 * Determine if a task needs user attention based on its state
 */
function taskNeedsAttention(
  task: Task & { session_status?: SessionStatus; loop_count?: number },
  maxLoopCount: number = 5
): boolean {
  // Task completed but needs approval
  if (task.session_status === 'completed' && !task.auto_approve) {
    return true;
  }

  // Task/agent failed
  if (task.session_status === 'failed') {
    return true;
  }

  // Task is blocked by other tasks
  if (task.blockers && task.blockers.length > 0) {
    return true;
  }

  // Task is stuck in a loop
  if (typeof task.loop_count === 'number' && task.loop_count >= maxLoopCount) {
    return true;
  }

  return false;
}

/**
 * Get the reason why a task needs attention
 */
function getAttentionReason(
  task: Task & { session_status?: SessionStatus; loop_count?: number },
  maxLoopCount: number = 5
): 'awaiting_approval' | 'failed' | 'blocked' | 'stuck' | null {
  if (task.session_status === 'completed' && !task.auto_approve) {
    return 'awaiting_approval';
  }

  if (task.session_status === 'failed') {
    return 'failed';
  }

  if (task.blockers && task.blockers.length > 0) {
    return 'blocked';
  }

  if (typeof task.loop_count === 'number' && task.loop_count >= maxLoopCount) {
    return 'stuck';
  }

  return null;
}

/**
 * Format notification content based on task state and reason
 */
function formatNotification(
  task: Task & { session_status?: SessionStatus; loop_count?: number },
  reason: 'awaiting_approval' | 'failed' | 'blocked' | 'stuck'
): { title: string; body: string } {
  const taskTitle = `${task.id}: ${task.title}`;

  switch (reason) {
    case 'awaiting_approval':
      return {
        title: `${task.id} needs approval`,
        body: `${task.phase} phase completed - awaiting your approval`,
      };

    case 'failed':
      return {
        title: `${task.id} failed`,
        body: `Agent failed during ${task.phase} phase - needs your attention`,
      };

    case 'blocked':
      return {
        title: `${task.id} is blocked`,
        body: `Task has ${task.blockers.length} blocker(s) - check dependencies`,
      };

    case 'stuck':
      return {
        title: `${task.id} is stuck`,
        body: `Task looped ${task.loop_count} times - needs intervention`,
      };

    default:
      return {
        title: `${task.id} needs attention`,
        body: taskTitle,
      };
  }
}

/**
 * Hook for managing browser notifications for Mark2 tasks
 */
export function useNotifications(options: UseNotificationsOptions): UseNotificationsResult {
  const { tasks, selectedTaskId, isWindowFocused = true } = options;

  // Permission state
  const [permission, setPermission] = useState<NotificationPermission>(
    NotificationService.getPermission()
  );

  // Enabled state
  const [enabled, setEnabledState] = useState<boolean>(
    NotificationService.isEnabled()
  );

  // Track previous task states to detect changes
  const previousTaskStatesRef = useRef<Map<string, string>>(new Map());

  // Request permission handler
  const requestPermission = useCallback(async () => {
    const newPermission = await NotificationService.requestPermission();
    setPermission(newPermission);
  }, []);

  // Set enabled handler
  const setEnabled = useCallback((newEnabled: boolean) => {
    NotificationService.setEnabled(newEnabled);
    setEnabledState(newEnabled);
  }, []);

  // Calculate tasks that need attention
  const pendingAttention = tasks.filter((task) => {
    // Use max_loop_count from config if available, default to 5
    const maxLoopCount = 5; // TODO: get from config if needed
    return taskNeedsAttention(task as any, maxLoopCount);
  });

  // Monitor task state changes and trigger notifications
  useEffect(() => {
    // Skip if notifications are not supported, enabled, or permitted
    if (!NotificationService.isSupported() || !enabled || permission !== 'granted') {
      return;
    }

    const currentTaskStates = new Map<string, string>();
    const maxLoopCount = 5;

    for (const task of tasks) {
      const taskWithStatus = task as Task & {
        session_status?: SessionStatus;
        loop_count?: number;
      };

      // Build a state signature for this task
      const stateSignature = JSON.stringify({
        id: task.id,
        session_status: taskWithStatus.session_status,
        blockers: task.blockers,
        loop_count: taskWithStatus.loop_count,
        phase: task.phase,
      });

      currentTaskStates.set(task.id, stateSignature);

      // Check if state changed
      const previousState = previousTaskStatesRef.current.get(task.id);
      const stateChanged = previousState !== stateSignature;

      // Skip if state hasn't changed
      if (!stateChanged) continue;

      // Skip if task doesn't need attention
      if (!taskNeedsAttention(taskWithStatus, maxLoopCount)) continue;

      // Skip if user is already viewing this task
      if (selectedTaskId === task.id) continue;

      // Skip if this task was already notified in this session
      if (NotificationService.hasBeenNotified(task.id)) continue;

      // Get the reason for attention
      const reason = getAttentionReason(taskWithStatus, maxLoopCount);
      if (!reason) continue;

      // Format the notification
      const { title, body } = formatNotification(taskWithStatus, reason);

      // Show the notification
      const shown = NotificationService.show({
        taskId: task.id,
        title,
        body,
        tag: `mark2-task-${task.id}`,
      });

      if (shown) {
        console.log(`Notification shown for task ${task.id}: ${reason}`);
      }
    }

    // Update the previous states reference
    previousTaskStatesRef.current = currentTaskStates;
  }, [tasks, selectedTaskId, isWindowFocused, enabled, permission]);

  return {
    permission,
    enabled,
    requestPermission,
    setEnabled,
    isSupported: NotificationService.isSupported(),
    pendingAttention,
  };
}
