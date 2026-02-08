'use client';

import type { PlanPhase } from '@/types';

interface PlanPhaseStepperProps {
  currentPhase: PlanPhase;
}

const STEPS: { phase: PlanPhase; label: string }[] = [
  { phase: 'prd', label: 'PRD' },
  { phase: 'prd_review', label: 'Review' },
  { phase: 'tech_spec', label: 'Tech Spec' },
  { phase: 'tech_spec_review', label: 'Review' },
  { phase: 'task_generation', label: 'Tasks' },
  { phase: 'task_review', label: 'Review' },
  { phase: 'done', label: 'Done' },
];

const PHASE_ORDER: PlanPhase[] = [
  'prompt', 'prd', 'prd_review', 'tech_spec', 'tech_spec_review',
  'task_generation', 'task_review', 'done',
];

export function PlanPhaseStepper({ currentPhase }: PlanPhaseStepperProps) {
  const currentIndex = PHASE_ORDER.indexOf(currentPhase);

  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {STEPS.map((step, idx) => {
        const stepIndex = PHASE_ORDER.indexOf(step.phase);
        const isCompleted = stepIndex < currentIndex;
        const isCurrent = step.phase === currentPhase;

        return (
          <div key={step.phase} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`h-2 w-2 rounded-full mb-1 ${
                  isCompleted
                    ? 'bg-emerald-400'
                    : isCurrent
                      ? 'bg-accent ring-2 ring-accent/30'
                      : 'bg-border'
                }`}
              />
              <span
                className={`text-[10px] leading-tight text-center ${
                  isCurrent
                    ? 'text-accent font-medium'
                    : isCompleted
                      ? 'text-emerald-400/70'
                      : 'text-text-secondary/50'
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`h-px flex-1 mx-1 ${
                  stepIndex < currentIndex ? 'bg-emerald-400/40' : 'bg-border'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
