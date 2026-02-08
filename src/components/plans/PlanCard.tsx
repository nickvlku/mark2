'use client';

import type { Plan, PlanPhase } from '@/types';

interface PlanCardProps {
  plan: Plan;
  onClick: () => void;
}

const PHASE_LABELS: Record<PlanPhase, string> = {
  prompt: 'Prompt',
  prd: 'PRD',
  prd_review: 'PRD Review',
  tech_spec: 'Tech Spec',
  tech_spec_review: 'Tech Spec Review',
  task_generation: 'Task Generation',
  task_review: 'Task Review',
  done: 'Done',
};

const PHASE_COLORS: Record<PlanPhase, string> = {
  prompt: 'bg-gray-500/20 text-gray-300',
  prd: 'bg-blue-500/20 text-blue-300',
  prd_review: 'bg-blue-500/20 text-blue-300',
  tech_spec: 'bg-purple-500/20 text-purple-300',
  tech_spec_review: 'bg-purple-500/20 text-purple-300',
  task_generation: 'bg-orange-500/20 text-orange-300',
  task_review: 'bg-orange-500/20 text-orange-300',
  done: 'bg-emerald-500/20 text-emerald-300',
};

const ORDERED_PHASES: PlanPhase[] = [
  'prompt', 'prd', 'prd_review', 'tech_spec', 'tech_spec_review',
  'task_generation', 'task_review', 'done',
];

export function PlanCard({ plan, onClick }: PlanCardProps) {
  const currentPhaseIndex = ORDERED_PHASES.indexOf(plan.phase);
  const createdDate = new Date(plan.created_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border border-border bg-bg-card p-4 hover:bg-bg-hover transition-colors"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-text-secondary">{plan.id}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${PHASE_COLORS[plan.phase]}`}>
              {PHASE_LABELS[plan.phase]}
            </span>
          </div>
          <h3 className="font-medium text-text-primary truncate">{plan.title}</h3>
        </div>
        <span className="text-xs text-text-secondary ml-2 shrink-0">{createdDate}</span>
      </div>

      <p className="text-xs text-text-secondary line-clamp-2 mb-3">{plan.prompt}</p>

      {/* Phase progress dots */}
      <div className="flex items-center gap-1">
        {ORDERED_PHASES.map((phase, idx) => (
          <div
            key={phase}
            className={`h-1.5 flex-1 rounded-full ${
              idx <= currentPhaseIndex
                ? idx === currentPhaseIndex
                  ? 'bg-accent'
                  : 'bg-accent/40'
                : 'bg-border'
            }`}
          />
        ))}
      </div>
    </button>
  );
}
