'use client';

import { useState, useCallback } from 'react';
import type { Plan } from '@/types';
import { usePlans } from '@/hooks/usePlans';
import { PlanCard } from './PlanCard';
import { CreatePlanDialog } from './CreatePlanDialog';
import { PlanDetail } from './PlanDetail';
import { PageHeader } from '@/components/shared/PageHeader';
import { Dialog } from '@/components/shared/Dialog';

type PhaseFilter = 'all' | 'active' | 'done';

export function PlansPage() {
  const { plans, mutate: mutatePlans, isLoading, error } = usePlans();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('all');
  const [confirmDelete, setConfirmDelete] = useState<Plan | null>(null);

  const filteredPlans = plans.filter((plan) => {
    if (phaseFilter === 'active') return plan.phase !== 'done';
    if (phaseFilter === 'done') return plan.phase === 'done';
    return true;
  });

  const handleCreatePlan = useCallback(() => {
    mutatePlans();
    setShowCreateDialog(false);
  }, [mutatePlans]);

  const handlePlanUpdate = useCallback(() => {
    mutatePlans();
  }, [mutatePlans]);

  const handleDeletePlan = useCallback(async () => {
    if (!confirmDelete) return;
    try {
      await fetch(`/api/plans/${confirmDelete.id}`, { method: 'DELETE' });
      mutatePlans();
      if (selectedPlanId === confirmDelete.id) {
        setSelectedPlanId(null);
      }
    } catch (err) {
      console.error('Failed to delete plan:', err);
    } finally {
      setConfirmDelete(null);
    }
  }, [confirmDelete, mutatePlans, selectedPlanId]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-text-secondary">Loading plans...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-red-400">Error loading plans: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        title="Plans"
        currentPage="plans"
        additionalElements={
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            {(['all', 'active', 'done'] as PhaseFilter[]).map((filter) => (
              <button
                key={filter}
                onClick={() => setPhaseFilter(filter)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  phaseFilter === filter
                    ? 'bg-bg-hover text-text-primary'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>
        }
        actions={
          <button
            onClick={() => setShowCreateDialog(true)}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
          >
            + Plan
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {filteredPlans.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center rounded-lg border border-border bg-bg-card">
            <div className="text-text-secondary mb-4">
              {phaseFilter === 'all' ? 'No plans yet' : `No ${phaseFilter} plans`}
            </div>
            {phaseFilter === 'all' && (
              <button
                onClick={() => setShowCreateDialog(true)}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
              >
                + Create Plan
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredPlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onClick={() => setSelectedPlanId(plan.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Plan Detail Slide-over */}
      {selectedPlanId && (
        <PlanDetail
          planId={selectedPlanId}
          onClose={() => setSelectedPlanId(null)}
          onUpdate={handlePlanUpdate}
          onDelete={(plan) => setConfirmDelete(plan)}
        />
      )}

      {/* Create Dialog */}
      {showCreateDialog && (
        <CreatePlanDialog
          onClose={() => setShowCreateDialog(false)}
          onCreate={handleCreatePlan}
        />
      )}

      {/* Delete Confirmation */}
      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete Plan"
        description={`Permanently delete ${confirmDelete?.id}? This will remove the plan and all its artifacts. Created stories and tasks will not be affected.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeletePlan}
      />
    </div>
  );
}
