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

// Constants for notification logic
export const DEFAULT_MAX_LOOP_COUNT = 5;

/**
 * Determine if a task needs user attention based on its state
 * Exported for testing purposes
 */
export function taskNeedsAttention(
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
 * Exported for testing purposes
 */
export function getAttentionReason(
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

  // Use safe defaults for SSR - will be hydrated on client
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [enabled, setEnabledState] = useState<boolean>(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Track previous task states to detect changes
  const previousTaskStatesRef = useRef<Map<string, string>>(new Map());

  // Hydrate state on client mount
  useEffect(() => {
    setPermission(NotificationService.getPermission());
    setEnabledState(NotificationService.isEnabled());
    setIsHydrated(true);
  }, []);

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
    return taskNeedsAttention(task as Task & { session_status?: SessionStatus; loop_count?: number }, maxLoopCount);
  });

  // Monitor task state changes and trigger notifications
  useEffect(() => {
    // Skip until client-side hydration is complete
    if (!isHydrated) {
      console.debug('[Notifications] Skipping - not hydrated yet');
      return;
    }

    // Skip if notifications are not supported, enabled, or permitted
    if (!NotificationService.isSupported()) {
      console.debug('[Notifications] Skipping - not supported');
      return;
    }
    if (!enabled) {
      console.debug('[Notifications] Skipping - not enabled');
      return;
    }
    if (permission !== 'granted') {
      console.debug('[Notifications] Skipping - permission not granted:', permission);
      return;
    }

    console.debug('[Notifications] Checking tasks:', tasks.length, 'isWindowFocused:', isWindowFocused);

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

      console.debug(`[Notifications] ${task.id} state changed:`, {
        session_status: taskWithStatus.session_status,
        auto_approve: task.auto_approve,
        needsAttention: taskNeedsAttention(taskWithStatus, maxLoopCount),
      });

      // Skip if task doesn't need attention
      if (!taskNeedsAttention(taskWithStatus, maxLoopCount)) {
        console.debug(`[Notifications] ${task.id} - skipping, doesn't need attention`);
        continue;
      }

      // Skip if user is actively viewing this task (window focused AND task selected)
      if (isWindowFocused && selectedTaskId === task.id) {
        console.debug(`[Notifications] ${task.id} - skipping, user is actively viewing it`);
        continue;
      }

      // Skip if this task was already notified in this session
      if (NotificationService.hasBeenNotified(task.id)) {
        console.debug(`[Notifications] ${task.id} - skipping, already notified this session`);
        continue;
      }

      // Get the reason for attention
      const reason = getAttentionReason(taskWithStatus, maxLoopCount);
      if (!reason) {
        console.debug(`[Notifications] ${task.id} - skipping, no reason found`);
        continue;
      }

      // Format the notification
      const { title, body } = formatNotification(taskWithStatus, reason);

      console.debug(`[Notifications] ${task.id} - SENDING notification:`, { reason, title });

      // Show the notification
      const shown = NotificationService.show({
        taskId: task.id,
        title,
        body,
        tag: `mark2-task-${task.id}`,
      });

      if (shown) {
        console.log(`[Notification] Task ${task.id}: ${reason}`);
      }
    }

    // Update the previous states reference
    previousTaskStatesRef.current = currentTaskStates;
  }, [tasks, selectedTaskId, isWindowFocused, enabled, permission, isHydrated]);

  return {
    permission,
    enabled,
    requestPermission,
    setEnabled,
    isSupported: NotificationService.isSupported(),
    pendingAttention,
  };
}
