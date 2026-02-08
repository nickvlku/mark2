'use client';

import { useDraggable } from '@dnd-kit/core';
import type { Task, TaskWithSession, SessionStatus } from '@/types';
import { PriorityBadge, AgentBadge, StatusIndicator, BlockerBadge, LockBadge, LockInfo, StoryBadge } from './CardBadges';
import { useRelativeTime, useIsLockExpired } from '@/hooks/useRelativeTime';

interface CardProps {
  task: Task & { session_status?: SessionStatus; lock?: LockInfo };
  onClick: (task: Task) => void;
  onArchive?: (taskId: string) => void;
  onRestore?: (taskId: string) => void;
  onDelete?: (taskId: string) => void;
  currentUserEmail?: string;
  lockTimeoutDays?: number;
}

function getTaskStatus(task: Task & { session_status?: SessionStatus }): string {
  if (task.blockers.length > 0) return 'blocked';
  if (task.phase === 'done') return 'idle';

  // Use session_status if available
  if (task.session_status) {
    switch (task.session_status) {
      case 'running':
        return 'running';
      case 'completed':
        // If completed but not auto_approve, it's waiting for approval
        if (!task.auto_approve) {
          return 'waiting';
        }
        return 'idle';
      case 'failed':
        return 'failed';
      default:
        return 'idle';
    }
  }

  // Fallback to legacy logic
  if (task.phase_agents && Object.keys(task.phase_agents).length > 0) return 'running';
  return 'idle';
}

export function Card({ task, onClick, onArchive, onRestore, onDelete, currentUserEmail, lockTimeoutDays = 5 }: CardProps) {
  const taskWithLock = task as Task & { session_status?: SessionStatus; lock?: LockInfo };
  const lock = taskWithLock.lock;
  const isMine = lock && currentUserEmail ? lock.email === currentUserEmail : false;
  const isExpired = useIsLockExpired(lock?.locked_at, lockTimeoutDays);
  const phaseTime = useRelativeTime(task.phase_entered_at);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: task.archived || (lock && !isMine && !isExpired), // Disable dragging for locked tasks
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const status = getTaskStatus(task);

  return (
    <div
      ref={setNodeRef}
      data-draggable="true"
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation();
        onClick(task);
      }}
      className={`group cursor-pointer rounded-lg border p-3 transition-all ${
        task.archived
          ? 'opacity-60 border-border/50 bg-bg-card/50'
          : lock && !isMine && !isExpired
          ? 'border-orange-500/30 bg-bg-card hover:border-orange-500/50 hover:bg-bg-hover'
          : 'border-border bg-bg-card hover:border-accent/50 hover:bg-bg-hover'
      } ${
        isDragging ? 'opacity-50 shadow-xl rotate-2 scale-105' : ''
      }`}
    >
      {/* Top row: Priority + ID + Lock */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <PriorityBadge priority={task.priority} />
          <span className="text-xs font-mono text-text-secondary">{task.id}</span>
          {lock && <LockBadge lock={lock} isMine={isMine} isExpired={isExpired} />}
        </div>
        <StatusIndicator status={status} />
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-text-primary leading-snug mb-2 line-clamp-2">
        {task.title}
      </h3>

      {/* Bottom row: story, agents, blockers, time */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          {task.story_id && <StoryBadge storyId={task.story_id} />}
          {task.phase_agents && Object.entries(task.phase_agents).map(([phase, agent]) => (
            <AgentBadge key={phase} name={agent} />
          ))}
          <BlockerBadge count={task.blockers.length} />
        </div>
        <span className="text-[10px] text-text-secondary shrink-0 ml-2">
          {phaseTime}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {!task.archived && onArchive && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onArchive(task.id);
            }}
            className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
            title="Archive task"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
            </svg>
          </button>
        )}

        {task.archived && onRestore && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRestore(task.id);
            }}
            className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
            title="Restore task"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>
        )}

        {task.archived && onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
            title="Delete permanently"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
