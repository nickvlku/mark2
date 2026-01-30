'use client';

import { useState } from 'react';
import type { Phase, Task } from '@/types';
import { Dialog } from './Dialog';
import { ArtifactViewer } from './ArtifactViewer';

interface ActionBarProps {
  task: Task;
  onPhaseAction: (action: { phase: Phase } | { restart: true }) => void;
  onToggleAutoApprove: (value: boolean) => void;
}

interface PhaseButton {
  label: string;
  variant: 'primary' | 'success' | 'danger' | 'secondary';
  target: { phase: Phase } | { restart: true };
}

const phaseActions: Record<Phase, PhaseButton[]> = {
  pending: [
    { label: 'Start Design', variant: 'primary', target: { phase: 'design' } },
  ],
  design: [
    { label: 'Approve Design', variant: 'success', target: { phase: 'coding' } },
    { label: 'Restart Phase', variant: 'danger', target: { restart: true } },
  ],
  coding: [
    { label: 'Mark Coding Complete', variant: 'primary', target: { phase: 'testing' } },
    { label: 'Restart Phase', variant: 'danger', target: { restart: true } },
  ],
  testing: [
    { label: 'Tests Passing', variant: 'success', target: { phase: 'code_review' } },
    { label: 'Restart Phase', variant: 'danger', target: { restart: true } },
  ],
  code_review: [
    { label: 'Approve Review', variant: 'success', target: { phase: 'final_testing' } },
    { label: 'Request Fixes', variant: 'secondary', target: { phase: 'fix_review' } },
    { label: 'Restart Phase', variant: 'danger', target: { restart: true } },
  ],
  fix_review: [
    { label: 'Fixes Complete', variant: 'success', target: { phase: 'code_review' } },
    { label: 'Restart Phase', variant: 'danger', target: { restart: true } },
  ],
  final_testing: [
    { label: 'Tests Passing', variant: 'success', target: { phase: 'manual_testing' } },
    { label: 'Tests Failed', variant: 'secondary', target: { phase: 'fix_review' } },
    { label: 'Restart Phase', variant: 'danger', target: { restart: true } },
  ],
  manual_testing: [
    { label: 'Approve & Merge', variant: 'success', target: { phase: 'done' } },
    { label: 'Request Revisions', variant: 'secondary', target: { phase: 'fix_review' } },
  ],
  done: [],
};

const variantStyles: Record<string, string> = {
  primary: 'bg-indigo-600 hover:bg-indigo-500 text-white',
  success: 'bg-green-600 hover:bg-green-500 text-white',
  danger: 'bg-red-600 hover:bg-red-500 text-white',
  secondary: 'border border-border text-text-secondary hover:bg-bg-hover',
};

/**
 * Returns true if the button is a forward phase transition (not restart, not backward).
 */
function isForwardTransition(btn: PhaseButton, currentPhase: Phase): boolean {
  if ('restart' in btn.target) return false;
  // "Request Fixes" and "Request Revisions" go backward — not forward
  const phaseOrder: Phase[] = ['pending', 'design', 'coding', 'testing', 'code_review', 'fix_review', 'final_testing', 'manual_testing', 'done'];
  const currentIdx = phaseOrder.indexOf(currentPhase);
  const targetIdx = phaseOrder.indexOf(btn.target.phase);
  return targetIdx > currentIdx;
}

export function ActionBar({ task, onPhaseAction, onToggleAutoApprove }: ActionBarProps) {
  const [confirmButton, setConfirmButton] = useState<PhaseButton | null>(null);
  const actions = phaseActions[task.phase] ?? [];

  const phaseArtifacts = task.artifacts.filter((a) => a.phase === task.phase);

  // Determine if this button needs artifact review
  const needsArtifactReview = (btn: PhaseButton): boolean => {
    if (task.auto_approve) return false;
    if ('restart' in btn.target) return false;
    return isForwardTransition(btn, task.phase) && phaseArtifacts.length > 0;
  };

  const handleButtonClick = (btn: PhaseButton) => {
    if (needsArtifactReview(btn)) {
      // Show review dialog with artifacts
      setConfirmButton(btn);
    } else if (btn.variant === 'danger' || btn.variant === 'success') {
      // Show simple confirmation dialog
      setConfirmButton(btn);
    } else {
      onPhaseAction(btn.target);
    }
  };

  const isReviewDialog = confirmButton ? needsArtifactReview(confirmButton) : false;

  if (actions.length === 0) return null;

  return (
    <>
      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        {actions.map((btn) => (
          <button
            key={btn.label}
            onClick={() => handleButtonClick(btn)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${variantStyles[btn.variant]}`}
          >
            {btn.label}
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Auto-approve toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={task.auto_approve}
            onChange={(e) => onToggleAutoApprove(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border accent-accent cursor-pointer"
          />
          <span className="text-xs text-text-secondary">Auto-approve</span>
        </label>
      </div>

      {/* Review dialog with artifacts */}
      {isReviewDialog && (
        <Dialog
          open={!!confirmButton}
          onClose={() => setConfirmButton(null)}
          title={`Review & ${confirmButton?.label}`}
          description={`Review the artifacts produced in the "${task.phase}" phase before proceeding.`}
          confirmLabel={confirmButton?.label ?? 'Confirm'}
          variant={confirmButton?.variant === 'danger' ? 'danger' : 'default'}
          wide
          onConfirm={() => {
            if (confirmButton) onPhaseAction(confirmButton.target);
          }}
        >
          <div className="max-h-80 overflow-y-auto space-y-2">
            {phaseArtifacts.map((artifact) => (
              <ArtifactViewer
                key={artifact.path}
                artifact={artifact}
                taskId={task.id}
              />
            ))}

            {phaseArtifacts.length === 0 && (
              <p className="text-sm text-text-secondary py-2">No artifacts produced in this phase.</p>
            )}
          </div>
        </Dialog>
      )}

      {/* Simple confirmation dialog (restart, non-artifact transitions) */}
      {!isReviewDialog && (
        <Dialog
          open={!!confirmButton}
          onClose={() => setConfirmButton(null)}
          title={`Confirm: ${confirmButton?.label}`}
          description={`Are you sure you want to "${confirmButton?.label}" for ${task.id}?`}
          confirmLabel={confirmButton?.label ?? 'Confirm'}
          variant={confirmButton?.variant === 'danger' ? 'danger' : 'default'}
          onConfirm={() => {
            if (confirmButton) onPhaseAction(confirmButton.target);
          }}
        />
      )}
    </>
  );
}
