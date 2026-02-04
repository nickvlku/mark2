/**
 * Browser Notification Service
 *
 * Manages browser notification permissions and display for Mark2 tasks.
 * Uses the Web Notifications API with proper feature detection and graceful degradation.
 */

export type NotificationPermission = 'default' | 'granted' | 'denied';

export interface TaskNotification {
  taskId: string;
  title: string;
  body: string;
  tag?: string; // For deduplication/replacement
}

// LocalStorage keys
const NOTIFICATIONS_ENABLED_KEY = 'mark2_notifications_enabled';
const NOTIFIED_TASKS_KEY = 'mark2_notified_tasks'; // sessionStorage

// Track active notifications by task ID
const activeNotifications = new Map<string, Notification>();

/**
 * Check if the browser supports the Notifications API
 */
function isSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Get the current notification permission state
 */
function getPermission(): NotificationPermission {
  if (!isSupported()) return 'denied';
  return Notification.permission as NotificationPermission;
}

/**
 * Request notification permission from the user
 * @returns Promise resolving to the new permission state
 */
async function requestPermission(): Promise<NotificationPermission> {
  if (!isSupported()) return 'denied';

  try {
    const permission = await Notification.requestPermission();
    return permission as NotificationPermission;
  } catch (error) {
    console.error('Failed to request notification permission:', error);
    return 'denied';
  }
}

/**
 * Check if notifications are enabled by the user (opt-in/out preference)
 */
function isEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const enabled = localStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
  // Default to true if not explicitly set
  return enabled === null || enabled === 'true';
}

/**
 * Set the user's notification preference
 */
function setEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, String(enabled));
}

/**
 * Get the set of task IDs that have already been notified in this session
 */
function getNotifiedTasks(): Set<string> {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
    return new Set();
  }

  try {
    const stored = sessionStorage.getItem(NOTIFIED_TASKS_KEY);
    if (!stored) return new Set<string>();
    const array = JSON.parse(stored);
    return new Set<string>(Array.isArray(array) ? array : []);
  } catch {
    return new Set<string>();
  }
}

/**
 * Mark a task as having been notified in this session
 */
function markTaskAsNotified(taskId: string): void {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;

  const notified = getNotifiedTasks();
  notified.add(taskId);
  sessionStorage.setItem(NOTIFIED_TASKS_KEY, JSON.stringify([...notified]));
}

/**
 * Check if a task has already been notified in this session
 */
function hasBeenNotified(taskId: string): boolean {
  return getNotifiedTasks().has(taskId);
}

/**
 * Show a notification for a task
 * @returns true if the notification was shown, false otherwise
 */
function show(notification: TaskNotification): boolean {
  // Check all preconditions
  if (!isSupported()) {
    console.warn('Notifications not supported in this browser');
    return false;
  }

  if (!isEnabled()) {
    console.debug('Notifications disabled by user preference');
    return false;
  }

  if (getPermission() !== 'granted') {
    console.debug('Notification permission not granted');
    return false;
  }

  if (hasBeenNotified(notification.taskId)) {
    console.debug(`Task ${notification.taskId} already notified in this session`);
    return false;
  }

  try {
    // Close any existing notification for this task
    close(notification.taskId);

    // Create the notification
    const notif = new Notification(notification.title, {
      body: notification.body,
      tag: notification.tag || `mark2-task-${notification.taskId}`,
      icon: '/favicon.ico', // Use the app icon
      requireInteraction: false, // Don't force user to dismiss
      silent: false, // Allow notification sound
    });

    // Handle notification click - focus window and navigate to task
    notif.onclick = () => {
      window.focus();

      // Dispatch custom event for the app to handle navigation
      window.dispatchEvent(
        new CustomEvent('mark2:notification-click', {
          detail: { taskId: notification.taskId },
        })
      );

      notif.close();
    };

    // Track the notification
    activeNotifications.set(notification.taskId, notif);

    // Mark as notified
    markTaskAsNotified(notification.taskId);

    // Auto-close after 10 seconds
    setTimeout(() => {
      close(notification.taskId);
    }, 10000);

    return true;
  } catch (error) {
    console.error('Failed to show notification:', error);
    return false;
  }
}

/**
 * Close a notification for a specific task
 */
function close(taskId: string): void {
  const notif = activeNotifications.get(taskId);
  if (notif) {
    notif.close();
    activeNotifications.delete(taskId);
  }
}

/**
 * Close all active notifications
 */
function closeAll(): void {
  const taskIds = Array.from(activeNotifications.keys());
  for (const taskId of taskIds) {
    close(taskId);
  }
}

/**
 * Clear the notified tasks tracking (useful for testing or manual reset)
 */
function clearNotifiedTasks(): void {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(NOTIFIED_TASKS_KEY);
}

/**
 * Notification Service API
 *
 * Singleton service for managing browser notifications
 */
export const NotificationService = {
  isSupported,
  getPermission,
  requestPermission,
  isEnabled,
  setEnabled,
  show,
  close,
  closeAll,
  clearNotifiedTasks,
  hasBeenNotified,
};
