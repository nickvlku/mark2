'use client';

import { useState } from 'react';
import type { Phase, Task } from '@/types';
import { Dialog } from './Dialog';

interface ActionBarProps {
  task: Task;
  onPhaseAction: (action: string) => void;
}

interface PhaseAction {
  label: string;
  action: string;
  variant: 'primary' | 'success' | 'danger' | 'secondary';
}

const phaseActions: Record<Phase, PhaseAction[]> = {
  pending: [
    { label: 'Start Design', action: 'start_design', variant: 'primary' },
  ],
  design: [
    { label: 'Approve Design', action: 'approve_design', variant: 'success' },
    { label: 'Request Changes', action: 'request_design_changes', variant: 'secondary' },
  ],
  coding: [
    { label: 'Mark Coding Complete', action: 'complete_coding', variant: 'primary' },
  ],
  testing: [
    { label: 'Tests Passing', action: 'tests_passing', variant: 'success' },
    { label: 'Re-run Tests', action: 'rerun_tests', variant: 'secondary' },
  ],
  code_review: [
    { label: 'Approve Review', action: 'approve_review', variant: 'success' },
    { label: 'Request Fixes', action: 'request_review_fixes', variant: 'secondary' },
  ],
  manual_testing: [
    { label: 'Approve & Merge', action: 'approve_merge', variant: 'success' },
    { label: 'Request Revisions', action: 'request_revisions', variant: 'danger' },
  ],
  done: [],
};

const variantStyles: Record<string, string> = {
  primary: 'bg-indigo-600 hover:bg-indigo-500 text-white',
  success: 'bg-green-600 hover:bg-green-500 text-white',
  danger: 'bg-red-600 hover:bg-red-500 text-white',
  secondary: 'border border-border text-text-secondary hover:bg-bg-hover',
};

export function ActionBar({ task, onPhaseAction }: ActionBarProps) {
  const [confirmAction, setConfirmAction] = useState<PhaseAction | null>(null);
  const actions = phaseActions[task.phase] ?? [];

  if (actions.length === 0) return null;

  return (
    <>
      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        {actions.map((action) => (
          <button
            key={action.action}
            onClick={() => {
              if (action.variant === 'danger' || action.variant === 'success') {
                setConfirmAction(action);
              } else {
                onPhaseAction(action.action);
              }
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${variantStyles[action.variant]}`}
          >
            {action.label}
          </button>
        ))}
      </div>

      <Dialog
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={`Confirm: ${confirmAction?.label}`}
        description={`Are you sure you want to "${confirmAction?.label}" for ${task.id}?`}
        confirmLabel={confirmAction?.label ?? 'Confirm'}
        variant={confirmAction?.variant === 'danger' ? 'danger' : 'default'}
        onConfirm={() => {
          if (confirmAction) onPhaseAction(confirmAction.action);
        }}
      />
    </>
  );
}
