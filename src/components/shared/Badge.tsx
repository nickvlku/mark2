'use client';

import type { Priority, Phase } from '@/types';

type BadgeVariant = 'priority' | 'status' | 'agent' | 'phase';

interface BadgeProps {
  variant: BadgeVariant;
  value: string;
  className?: string;
}

const priorityStyles: Record<string, string> = {
  P0: 'bg-red-500/20 text-red-400 border-red-500/30',
  P1: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  P2: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  P3: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const statusStyles: Record<string, string> = {
  running: 'bg-green-500/20 text-green-400 border-green-500/30',
  idle: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  waiting: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
  looping: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  blocked: 'bg-red-500/20 text-red-300 border-red-500/30',
  stuck: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

const phaseStyles: Record<string, string> = {
  pending: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  design: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  coding: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  testing: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  code_review: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  manual_testing: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  done: 'bg-green-500/20 text-green-400 border-green-500/30',
};

function getStyles(variant: BadgeVariant, value: string): string {
  switch (variant) {
    case 'priority':
      return priorityStyles[value] ?? priorityStyles.P2;
    case 'status':
      return statusStyles[value] ?? statusStyles.idle;
    case 'phase':
      return phaseStyles[value] ?? phaseStyles.pending;
    case 'agent':
      return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
}

export function Badge({ variant, value, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium ${getStyles(variant, value)} ${className}`}
    >
      {value}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge variant="priority" value={priority} />;
}

export function StatusDot({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    running: 'bg-green-400',
    idle: 'bg-gray-500',
    waiting: 'bg-amber-400',
    failed: 'bg-red-400',
    looping: 'bg-purple-400',
    blocked: 'bg-red-500',
    stuck: 'bg-orange-400',
  };
  const color = colorMap[status] ?? 'bg-gray-500';
  const isAnimated = status === 'running' || status === 'looping';

  return (
    <span className="relative flex h-2.5 w-2.5">
      {isAnimated && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${color}`}
        />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${color}`} />
    </span>
  );
}
