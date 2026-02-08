'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Plan, PlanPhase, ProposedStory } from '@/types';
import { usePlan } from '@/hooks/usePlan';
import { PlanPhaseStepper } from './PlanPhaseStepper';
import { PlanArtifactReview } from './PlanArtifactReview';
import { PlanTerminalView } from './PlanTerminalView';
import { TaskProposalView } from './TaskProposalView';
import { PlanArtifactsTab } from './PlanArtifactsTab';
import { PlanActivityTab } from './PlanActivityTab';
import { PlanCompleteSummary } from './PlanCompleteSummary';

interface PlanDetailProps {
  planId: string;
  onClose: () => void;
  onUpdate: () => void;
  onDelete: (plan: Plan) => void;
}

const AGENT_PHASES: PlanPhase[] = ['prd', 'tech_spec', 'task_generation'];
const REVIEW_PHASES: PlanPhase[] = ['prd_review', 'tech_spec_review'];

type TabId = 'phase' | 'artifacts' | 'activity';

const tabs: { id: TabId; label: string }[] = [
  { id: 'phase', label: 'Phase' },
  { id: 'artifacts', label: 'Artifacts' },
  { id: 'activity', label: 'Activity' },
];

export function PlanDetail({ planId, onClose, onUpdate, onDelete }: PlanDetailProps) {
  const { plan, mutate } = usePlan(planId);
  const [starting, setStarting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('phase');

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  const handleStart = async () => {
    if (!plan) return;
    setStarting(true);
    try {
      const res = await fetch(`/api/plans/${plan.id}/phase`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('Failed to start plan:', data.error);
        return;
      }
      mutate();
      onUpdate();
    } catch (err) {
      console.error('Failed to start plan:', err);
    } finally {
      setStarting(false);
    }
  };

  const handleApprove = async () => {
    if (!plan) return;
    try {
      await fetch(`/api/plans/${plan.id}/phase`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      mutate();
      onUpdate();
    } catch (err) {
      console.error('Failed to approve:', err);
    }
  };

  const handleRevise = async (feedback?: string) => {
    if (!plan) return;
    try {
      await fetch(`/api/plans/${plan.id}/phase`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revise', feedback }),
      });
      mutate();
      onUpdate();
    } catch (err) {
      console.error('Failed to revise:', err);
    }
  };

  const handleConfirmTasks = async (stories: ProposedStory[], projectPrefix?: string) => {
    if (!plan) return;
    try {
      const res = await fetch(`/api/plans/${plan.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposed_stories: stories, project_prefix: projectPrefix }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('Failed to confirm:', data.error);
        return;
      }
      mutate();
      onUpdate();
    } catch (err) {
      console.error('Failed to confirm tasks:', err);
    }
  };

  const handleRegenerate = async (feedback?: string) => {
    if (!plan) return;
    try {
      await fetch(`/api/plans/${plan.id}/phase`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revise', feedback }),
      });
      mutate();
      onUpdate();
    } catch (err) {
      console.error('Failed to regenerate:', err);
    }
  };

  if (!plan) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="fade-in absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="slide-in relative flex w-full max-w-2xl flex-col border-l border-border bg-bg-secondary shadow-2xl items-center justify-center">
          <div className="text-text-secondary">Loading plan...</div>
        </div>
      </div>
    );
  }

  const isAgentPhase = AGENT_PHASES.includes(plan.phase);
  const isReviewPhase = REVIEW_PHASES.includes(plan.phase);
  const isTaskReview = plan.phase === 'task_review';
  const isDone = plan.phase === 'done';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fade-in absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Slide-over Panel */}
      <div className="slide-in relative flex w-full max-w-2xl flex-col border-l border-border bg-bg-secondary shadow-2xl">
        {/* Header */}
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-text-secondary">{plan.id}</span>
              </div>
              <h2 className="text-base font-semibold text-text-primary leading-tight truncate">
                {plan.title}
              </h2>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={() => onDelete(plan)}
                className="rounded-lg p-1.5 text-text-secondary hover:text-red-400 hover:bg-bg-hover transition-colors"
                title="Delete plan"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Phase Stepper */}
        <div className="border-b border-border">
          <PlanPhaseStepper currentPhase={plan.phase} />
        </div>

        {/* Tabs */}
        <div className="border-b border-border">
          <div className="flex px-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {activeTab === 'phase' && (
            <>
              {isAgentPhase && (
                <PlanTerminalView plan={plan} />
              )}

              {isReviewPhase && (
                <PlanArtifactReview
                  plan={plan}
                  onApprove={handleApprove}
                  onRevise={handleRevise}
                />
              )}

              {isTaskReview && (
                <TaskProposalView
                  plan={plan}
                  onConfirm={handleConfirmTasks}
                  onRegenerate={handleRegenerate}
                />
              )}

              {isDone && (
                <PlanCompleteSummary plan={plan} />
              )}

              {plan.phase === 'prompt' && (
                <div className="flex-1 overflow-auto p-4">
                  <div className="rounded-lg border border-border bg-bg-primary p-4 mb-4">
                    <h4 className="text-sm font-medium text-text-primary mb-2">Prompt</h4>
                    <p className="text-sm text-text-secondary whitespace-pre-wrap">{plan.prompt}</p>
                  </div>
                  <button
                    onClick={handleStart}
                    disabled={starting}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                  >
                    {starting ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Starting...
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                        </svg>
                        Start PRD Generation
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}

          {activeTab === 'artifacts' && (
            <PlanArtifactsTab plan={plan} />
          )}

          {activeTab === 'activity' && (
            <PlanActivityTab plan={plan} />
          )}
        </div>
      </div>
    </div>
  );
}
