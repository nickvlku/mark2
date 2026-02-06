'use client';

import type { Priority } from '@/types';
import { useLockAge } from '@/hooks/useRelativeTime';

interface PriorityBadgeProps {
  priority: Priority;
}

const priorityConfig: Record<Priority, { bg: string; text: string }> = {
  P0: { bg: 'bg-red-500/20', text: 'text-red-400' },
  P1: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
  P2: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  P3: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
};

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  const config = priorityConfig[priority];
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${config.bg} ${config.text}`}
    >
      {priority}
    </span>
  );
}

interface AgentBadgeProps {
  name: string;
}

export function AgentBadge({ name }: AgentBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-medium text-indigo-400">
      <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
      {name}
    </span>
  );
}

interface StatusIndicatorProps {
  status: string;
}

const statusConfig: Record<string, { color: string; label: string; pulse: boolean }> = {
  running: { color: 'bg-green-400', label: 'Running', pulse: true },
  idle: { color: 'bg-gray-500', label: 'Idle', pulse: false },
  waiting: { color: 'bg-amber-400', label: 'Awaiting', pulse: true },
  completed: { color: 'bg-green-500', label: 'Done', pulse: false },
  failed: { color: 'bg-red-400', label: 'Failed', pulse: false },
  looping: { color: 'bg-purple-400', label: 'Looping', pulse: true },
  blocked: { color: 'bg-red-500', label: 'Blocked', pulse: false },
  stuck: { color: 'bg-orange-400', label: 'Stuck', pulse: false },
};

export function StatusIndicator({ status }: StatusIndicatorProps) {
  const config = statusConfig[status] ?? statusConfig.idle;
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-text-secondary">
      <span className="relative flex h-2 w-2">
        {config.pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${config.color}`}
          />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${config.color}`} />
      </span>
      {config.label}
    </span>
  );
}

interface BlockerBadgeProps {
  count: number;
}

export function BlockerBadge({ count }: BlockerBadgeProps) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
      </svg>
      {count} blocker{count > 1 ? 's' : ''}
    </span>
  );
}

export interface LockInfo {
  locked_by: string;
  email: string;
  locked_at: string;
  machine: string;
}

interface LockBadgeProps {
  lock: LockInfo;
  isMine?: boolean;
  isExpired?: boolean;
}

interface StoryBadgeProps {
  storyId: string;
}

export function StoryBadge({ storyId }: StoryBadgeProps) {
  // Convert STORY-1 to S-1 for compact display
  const shortId = storyId.replace('STORY-', 'S-');

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-medium text-purple-400"
      title={storyId}
    >
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
      </svg>
      {shortId}
    </span>
  );
}

export function LockBadge({ lock, isMine, isExpired }: LockBadgeProps) {
  // Use hook to calculate lock age (client-side only to avoid hydration mismatch)
  const timeStr = useLockAge(lock.locked_at);

  if (isMine) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-medium text-blue-400"
        title={`You locked this task ${timeStr}`}
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
        You
      </span>
    );
  }

  if (isExpired) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-medium text-yellow-400"
        title={`Lock expired - was held by ${lock.locked_by}`}
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
        Expired
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-medium text-orange-400"
      title={`Locked by ${lock.locked_by} (${lock.email}) ${timeStr}`}
    >
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
      {lock.locked_by}
    </span>
  );
}
