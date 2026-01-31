'use client';

import type { Phase, SessionStatus } from '@/types';

interface PhaseTimelineProps {
  currentPhase: Phase;
  sessionStatus?: SessionStatus;
  autoApprove?: boolean;
}

const PHASES: { key: Phase; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'design', label: 'Design' },
  { key: 'coding', label: 'Coding' },
  { key: 'testing', label: 'Testing' },
  { key: 'code_review', label: 'Review' },
  { key: 'manual_testing', label: 'QA' },
  { key: 'done', label: 'Done' },
];

const phaseIndex = (phase: Phase): number =>
  PHASES.findIndex((p) => p.key === phase);

export function PhaseTimeline({ currentPhase, sessionStatus, autoApprove }: PhaseTimelineProps) {
  const currentIdx = phaseIndex(currentPhase);

  // Check if current phase is awaiting approval (completed but not auto-approved)
  const isAwaitingApproval = sessionStatus === 'completed' && !autoApprove;

  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {PHASES.map((phase, idx) => {
        const isCompleted = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        // Current phase is "done" if awaiting approval
        const isCurrentDone = isCurrent && isAwaitingApproval;

        return (
          <div key={phase.key} className="flex items-center gap-1 flex-1">
            {/* Step circle */}
            <div className="flex flex-col items-center flex-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                  isCompleted || isCurrentDone
                    ? 'border-green-500 bg-green-500/20 text-green-400'
                    : isCurrent
                      ? 'border-accent bg-accent/20 text-accent'
                      : 'border-border bg-bg-primary text-text-secondary/50'
                }`}
              >
                {isCompleted || isCurrentDone ? (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                ) : (
                  idx + 1
                )}
              </div>
              <span
                className={`mt-1 text-[10px] font-medium ${
                  isCompleted || isCurrentDone
                    ? 'text-green-400'
                    : isCurrent
                      ? 'text-accent'
                      : 'text-text-secondary/50'
                }`}
              >
                {phase.label}
              </span>
              {/* Show "Awaiting" label if current phase is done but waiting approval */}
              {isCurrentDone && (
                <span className="mt-0.5 text-[8px] font-medium text-amber-400">
                  Awaiting
                </span>
              )}
            </div>

            {/* Connector line */}
            {idx < PHASES.length - 1 && (
              <div
                className={`h-0.5 flex-1 rounded-full -mt-4 ${
                  idx < currentIdx || (idx === currentIdx && isCurrentDone)
                    ? 'bg-green-500'
                    : 'bg-border'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
