'use client';

import { useDroppable } from '@dnd-kit/core';
import type { Task, Phase } from '@/types';
import { Card } from './Card';

interface ColumnProps {
  phase: Phase;
  tasks: Task[];
  onCardClick: (task: Task) => void;
  onArchive?: (taskId: string) => void;
  onRestore?: (taskId: string) => void;
  onDelete?: (taskId: string) => void;
  onArchiveAll?: () => void;
  currentUserEmail?: string;
  /** Optional prefix for droppable ID to ensure uniqueness across story sections */
  droppableIdPrefix?: string;
}

const phaseLabels: Record<Phase, string> = {
  pending: 'Pending',
  design: 'Design',
  coding: 'Coding',
  testing: 'Testing',
  code_review: 'Code Review',
  fix_review: 'Fix Review',
  final_testing: 'Final Testing',
  run_test_plan: 'Run Test Plan',
  done: 'Done',
};

const phaseColors: Record<Phase, string> = {
  pending: 'bg-gray-500',
  design: 'bg-violet-500',
  coding: 'bg-blue-500',
  testing: 'bg-amber-500',
  code_review: 'bg-cyan-500',
  fix_review: 'bg-rose-500',
  final_testing: 'bg-emerald-500',
  run_test_plan: 'bg-orange-500',
  done: 'bg-green-500',
};

export function Column({ phase, tasks, onCardClick, onArchive, onRestore, onDelete, onArchiveAll, currentUserEmail, droppableIdPrefix }: ColumnProps) {
  const droppableId = droppableIdPrefix ? `${droppableIdPrefix}::${phase}` : phase;
  const { isOver, setNodeRef } = useDroppable({
    id: droppableId,
    data: { phase, storyKey: droppableIdPrefix || null },
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
        {onArchiveAll && tasks.length > 0 && (
          <button
            onClick={onArchiveAll}
            className="ml-2 rounded px-2 py-0.5 text-xs font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
            title="Archive all tasks in this column"
          >
            Archive All ↓
          </button>
        )}
      </div>

      {/* Card List */}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2" style={{ maxHeight: 'calc(100vh - 160px)' }}>
        {tasks.length === 0 && (
          <div className="flex items-center justify-center py-8 text-xs text-text-secondary/50">
            No tasks
          </div>
        )}
        {tasks.map((task) => (
          <Card
            key={task.id}
            task={task}
            onClick={onCardClick}
            onArchive={onArchive}
            onRestore={onRestore}
            onDelete={onDelete}
            currentUserEmail={currentUserEmail}
          />
        ))}
      </div>
    </div>
  );
}
