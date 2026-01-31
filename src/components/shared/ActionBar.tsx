'use client';

import { useState, useEffect } from 'react';
import type { Phase, Task } from '@/types';
import { Dialog } from './Dialog';
import { ArtifactViewer } from './ArtifactViewer';

interface ActionBarProps {
  task: Task;
  onPhaseAction: (action: { phase: Phase; targetBranch?: string } | { restart: true }) => void;
  onToggleAutoApprove: (value: boolean) => void;
}

interface PhaseButton {
  label: string;
  variant: 'primary' | 'success' | 'danger' | 'secondary' | 'warning';
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
    { label: 'Request Fixes', variant: 'warning', target: { phase: 'fix_review' } },
    { label: 'Restart Phase', variant: 'danger', target: { restart: true } },
  ],
  fix_review: [
    { label: 'Fixes Complete', variant: 'success', target: { phase: 'code_review' } },
    { label: 'Restart Phase', variant: 'danger', target: { restart: true } },
  ],
  final_testing: [
    { label: 'Tests Passing', variant: 'success', target: { phase: 'manual_testing' } },
    { label: 'Tests Failed', variant: 'warning', target: { phase: 'fix_review' } },
    { label: 'Restart Phase', variant: 'danger', target: { restart: true } },
  ],
  manual_testing: [
    { label: 'Approve & Merge', variant: 'success', target: { phase: 'done' } },
    { label: 'Request Revisions', variant: 'warning', target: { phase: 'fix_review' } },
  ],
  done: [],
};

const variantStyles: Record<string, string> = {
  primary: 'bg-indigo-600 hover:bg-indigo-500 text-white',
  success: 'bg-green-600 hover:bg-green-500 text-white',
  danger: 'bg-red-600 hover:bg-red-500 text-white',
  warning: 'bg-amber-600 hover:bg-amber-500 text-white',
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
  const [branches, setBranches] = useState<string[]>([]);
  const [targetBranch, setTargetBranch] = useState<string>('main');
  const actions = phaseActions[task.phase] ?? [];

  // Fetch branches when in manual_testing phase
  useEffect(() => {
    if (task.phase === 'manual_testing') {
      fetch('/api/branches')
        .then((r) => r.json())
        .then((data) => {
          if (data.branches) {
            setBranches(data.branches);
            // Default to main if available
            if (data.branches.includes('main')) {
              setTargetBranch('main');
            } else if (data.branches.length > 0) {
              setTargetBranch(data.branches[0]);
            }
          }
        })
        .catch(console.error);
    }
  }, [task.phase]);

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

  // Check if this is the merge button
  const isMergeButton = (btn: PhaseButton) =>
    'phase' in btn.target && btn.target.phase === 'done';

  return (
    <>
      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        {actions.map((btn) => {
          // Special rendering for merge button with branch selector
          if (isMergeButton(btn) && branches.length > 0) {
            return (
              <div key={btn.label} className="flex items-center">
                <button
                  onClick={() => handleButtonClick(btn)}
                  className={`rounded-l-lg px-4 py-2 text-sm font-medium transition-colors ${variantStyles[btn.variant]}`}
                >
                  Merge to {targetBranch}
                </button>
                <div className="relative">
                  <select
                    value={targetBranch}
                    onChange={(e) => setTargetBranch(e.target.value)}
                    className={`h-full rounded-r-lg border-l border-white/20 px-2 py-2 text-sm font-medium cursor-pointer appearance-none pr-6 ${variantStyles[btn.variant]}`}
                    style={{ backgroundImage: 'none' }}
                  >
                    {branches.map((branch) => (
                      <option key={branch} value={branch} className="bg-bg-secondary text-text-primary">
                        {branch}
                      </option>
                    ))}
                  </select>
                  <svg
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                  </svg>
                </div>
              </div>
            );
          }

          // Standard button rendering
          return (
            <button
              key={btn.label}
              onClick={() => handleButtonClick(btn)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${variantStyles[btn.variant]}`}
            >
              {btn.label}
            </button>
          );
        })}

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
          title={`Review & ${confirmButton ? (isMergeButton(confirmButton) ? `Merge to ${targetBranch}` : confirmButton.label) : ''}`}
          description={`Review the artifacts produced in the "${task.phase}" phase before proceeding.`}
          confirmLabel={confirmButton ? (isMergeButton(confirmButton) ? `Merge to ${targetBranch}` : confirmButton.label) : 'Confirm'}
          variant={confirmButton?.variant === 'danger' ? 'danger' : 'default'}
          wide
          onConfirm={() => {
            if (confirmButton) {
              if (isMergeButton(confirmButton)) {
                onPhaseAction({ phase: 'done', targetBranch });
              } else {
                onPhaseAction(confirmButton.target);
              }
            }
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
          title={`Confirm: ${confirmButton ? (isMergeButton(confirmButton) ? `Merge to ${targetBranch}` : confirmButton.label) : ''}`}
          description={
            confirmButton && isMergeButton(confirmButton)
              ? `This will merge ${task.id} into the "${targetBranch}" branch.`
              : `Are you sure you want to "${confirmButton?.label}" for ${task.id}?`
          }
          confirmLabel={confirmButton ? (isMergeButton(confirmButton) ? `Merge to ${targetBranch}` : confirmButton.label) : 'Confirm'}
          variant={confirmButton?.variant === 'danger' ? 'danger' : 'default'}
          onConfirm={() => {
            if (confirmButton) {
              if (isMergeButton(confirmButton)) {
                onPhaseAction({ phase: 'done', targetBranch });
              } else {
                onPhaseAction(confirmButton.target);
              }
            }
          }}
        />
      )}
    </>
  );
}
