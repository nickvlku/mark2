'use client';

import { useDraggable } from '@dnd-kit/core';
import type { Task } from '@/types';
import { PriorityBadge, AgentBadge, StatusIndicator, BlockerBadge } from './CardBadges';

interface CardProps {
  task: Task;
  onClick: (task: Task) => void;
}

function getTaskStatus(task: Task): string {
  if (task.blockers.length > 0) return 'blocked';
  if (task.phase === 'done') return 'idle';
  if (task.assigned_agents.length > 0) return 'running';
  return 'idle';
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function Card({ task, onClick }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const status = getTaskStatus(task);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation();
        onClick(task);
      }}
      className={`group cursor-pointer rounded-lg border border-border bg-bg-card p-3 transition-all hover:border-accent/50 hover:bg-bg-hover ${
        isDragging ? 'opacity-50 shadow-xl rotate-2 scale-105' : ''
      }`}
    >
      {/* Top row: Priority + ID */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <PriorityBadge priority={task.priority} />
          <span className="text-xs font-mono text-text-secondary">{task.id}</span>
        </div>
        <StatusIndicator status={status} />
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-text-primary leading-snug mb-2 line-clamp-2">
        {task.title}
      </h3>

      {/* Bottom row: agents, blockers, time */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          {task.assigned_agents.map((agent) => (
            <AgentBadge key={agent} name={agent} />
          ))}
          <BlockerBadge count={task.blockers.length} />
        </div>
        <span className="text-[10px] text-text-secondary shrink-0 ml-2">
          {relativeTime(task.phase_entered_at)}
        </span>
      </div>
    </div>
  );
}
