'use client';

import { useDroppable } from '@dnd-kit/core';
import type { Task, Phase } from '@/types';
import { Card } from './Card';

interface ColumnProps {
  phase: Phase;
  tasks: Task[];
  onCardClick: (task: Task) => void;
}

const phaseLabels: Record<Phase, string> = {
  pending: 'Pending',
  design: 'Design',
  coding: 'Coding',
  testing: 'Testing',
  code_review: 'Code Review',
  manual_testing: 'Manual Testing',
  done: 'Done',
};

const phaseColors: Record<Phase, string> = {
  pending: 'bg-gray-500',
  design: 'bg-violet-500',
  coding: 'bg-blue-500',
  testing: 'bg-amber-500',
  code_review: 'bg-cyan-500',
  manual_testing: 'bg-orange-500',
  done: 'bg-green-500',
};

export function Column({ phase, tasks, onCardClick }: ColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: phase,
    data: { phase },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-[280px] max-w-[320px] flex-1 flex-col rounded-xl border transition-colors ${
        isOver
          ? 'border-accent/60 bg-accent/5'
          : 'border-border/50 bg-bg-secondary/50'
      }`}
    >
      {/* Column Header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-border/50">
        <span className={`h-2 w-2 rounded-full ${phaseColors[phase]}`} />
        <h2 className="text-sm font-semibold text-text-primary">
          {phaseLabels[phase]}
        </h2>
        <span className="ml-auto rounded-full bg-bg-primary px-2 py-0.5 text-xs font-medium text-text-secondary">
          {tasks.length}
        </span>
      </div>

      {/* Card List */}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2" style={{ maxHeight: 'calc(100vh - 160px)' }}>
        {tasks.length === 0 && (
          <div className="flex items-center justify-center py-8 text-xs text-text-secondary/50">
            No tasks
          </div>
        )}
        {tasks.map((task) => (
          <Card key={task.id} task={task} onClick={onCardClick} />
        ))}
      </div>
    </div>
  );
}
