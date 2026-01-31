'use client';

import { useState } from 'react';
import type { Phase, Task, TaskArtifact } from '@/types';
import { Dialog } from './Dialog';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ActionBarProps {
  task: Task;
  onPhaseAction: (action: { phase: Phase } | { restart: true }) => void;
  onToggleAutoApprove: (value: boolean) => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
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
    { label: 'Approve Review', variant: 'success', target: { phase: 'fix_review' } },
    { label: 'Request Fixes', variant: 'secondary', target: { phase: 'coding' } },
    { label: 'Restart Phase', variant: 'danger', target: { restart: true } },
  ],
  fix_review: [
    { label: 'Fixes Complete', variant: 'success', target: { phase: 'final_testing' } },
    { label: 'Need More Fixes', variant: 'secondary', target: { phase: 'coding' } },
    { label: 'Restart Phase', variant: 'danger', target: { restart: true } },
  ],
  final_testing: [
    { label: 'Tests Pass', variant: 'success', target: { phase: 'manual_testing' } },
    { label: 'Tests Failed', variant: 'secondary', target: { phase: 'coding' } },
    { label: 'Restart Phase', variant: 'danger', target: { restart: true } },
  ],
  manual_testing: [
    { label: 'Approve & Merge', variant: 'success', target: { phase: 'done' } },
    { label: 'Request Revisions', variant: 'secondary', target: { phase: 'coding' } },
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
  // "Request Fixes" and "Request Revisions" go backward to coding — not forward
  const phaseOrder: Phase[] = ['pending', 'design', 'coding', 'testing', 'code_review', 'manual_testing', 'done'];
  const currentIdx = phaseOrder.indexOf(currentPhase);
  const targetIdx = phaseOrder.indexOf(btn.target.phase);
  return targetIdx > currentIdx;
}

export function ActionBar({ task, onPhaseAction, onToggleAutoApprove, onArchive, onRestore, onDelete }: ActionBarProps) {
  const [confirmButton, setConfirmButton] = useState<PhaseButton | null>(null);
  const [artifactContents, setArtifactContents] = useState<Record<string, string>>({});
  const [expandedArtifact, setExpandedArtifact] = useState<string | null>(null);
  const actions = task.archived ? [] : (phaseActions[task.phase] ?? []);

  const phaseArtifacts = task.artifacts.filter((a) => a.phase === task.phase);

  // Load artifact content when expanded in the review dialog
  const loadArtifactContent = async (artifact: TaskArtifact) => {
    if (artifactContents[artifact.path]) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}/artifacts?path=${encodeURIComponent(artifact.path)}`);
      if (res.ok) {
        const data = await res.json();
        setArtifactContents((prev) => ({ ...prev, [artifact.path]: data.content ?? '' }));
      }
    } catch {
      setArtifactContents((prev) => ({ ...prev, [artifact.path]: 'Failed to load content.' }));
    }
  };

  const toggleArtifact = (artifact: TaskArtifact) => {
    if (expandedArtifact === artifact.path) {
      setExpandedArtifact(null);
    } else {
      setExpandedArtifact(artifact.path);
      loadArtifactContent(artifact);
    }
  };

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
      setExpandedArtifact(null);
    } else if (btn.variant === 'danger' || btn.variant === 'success') {
      // Show simple confirmation dialog
      setConfirmButton(btn);
    } else {
      onPhaseAction(btn.target);
    }
  };

  const isReviewDialog = confirmButton ? needsArtifactReview(confirmButton) : false;
  const isMarkdown = (name: string) => name.endsWith('.md') || name.endsWith('.markdown');

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

        {/* Archive actions */}
        {!task.archived && onArchive && (
          <button
            onClick={onArchive}
            className="rounded-lg px-3 py-1.5 text-xs font-medium border border-border text-text-secondary hover:bg-bg-hover transition-colors"
          >
            Archive
          </button>
        )}

        {task.archived && onRestore && (
          <button
            onClick={onRestore}
            className="rounded-lg px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            Restore
          </button>
        )}

        {task.archived && onDelete && (
          <button
            onClick={onDelete}
            className="rounded-lg px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
          >
            Delete
          </button>
        )}

        {/* Auto-approve toggle - only show for non-archived tasks */}
        {!task.archived && (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={task.auto_approve}
              onChange={(e) => onToggleAutoApprove(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border accent-accent cursor-pointer"
            />
            <span className="text-xs text-text-secondary">Auto-approve</span>
          </label>
        )}
      </div>

      {/* Review dialog with artifacts */}
      {isReviewDialog && (
        <Dialog
          open={!!confirmButton}
          onClose={() => { setConfirmButton(null); setExpandedArtifact(null); }}
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
              <div key={artifact.path} className="rounded-lg border border-border">
                <button
                  onClick={() => toggleArtifact(artifact)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-bg-hover transition-colors rounded-lg"
                >
                  <svg className="h-4 w-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-text-primary truncate block">{artifact.name}</span>
                    <span className="text-[10px] text-text-secondary font-mono truncate block">{artifact.path}</span>
                  </div>
                  <svg
                    className={`h-4 w-4 text-text-secondary transition-transform ${expandedArtifact === artifact.path ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {expandedArtifact === artifact.path && (
                  <div className="border-t border-border px-3 py-3 max-h-60 overflow-y-auto">
                    {artifactContents[artifact.path] ? (
                      isMarkdown(artifact.name) ? (
                        <MarkdownRenderer content={artifactContents[artifact.path]} />
                      ) : (
                        <pre className="rounded-lg bg-bg-primary p-3 text-xs text-text-secondary font-mono overflow-x-auto whitespace-pre-wrap">
                          {artifactContents[artifact.path]}
                        </pre>
                      )
                    ) : (
                      <div className="flex items-center justify-center py-4 text-xs text-text-secondary">
                        Loading...
                      </div>
                    )}
                  </div>
                )}
              </div>
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
