'use client';

import { useState, useMemo, useCallback } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import type { Task, AgentDefinition, AssignablePhase } from '@/types';
import { useAgents } from '@/hooks/useAgents';
import { ASSIGNABLE_PHASES } from '@/lib/yaml/schemas';

interface AgentsTabProps {
  task: Task;
  onUpdate: () => void;
}

const PHASE_LABELS: Record<AssignablePhase, string> = {
  design: 'Design',
  coding: 'Coding',
  testing: 'Testing',
  code_review: 'Code Review',
  manual_testing: 'Manual Testing',
};

const PHASE_DESCRIPTIONS: Record<AssignablePhase, string> = {
  design: 'Agent that creates the design document for the task',
  coding: 'Agent that implements the code changes',
  testing: 'Agent that writes and runs tests',
  code_review: 'Agent that reviews the code for issues',
  manual_testing: 'Agent that performs manual testing verification',
};

export function AgentsTab({ task, onUpdate }: AgentsTabProps) {
  const { agents, isLoading, error } = useAgents();
  const [localAssignments, setLocalAssignments] = useState<Record<string, string>>(
    task.phase_agents ?? {}
  );
  const [isSaving, setIsSaving] = useState(false);

  // Group agents by phase
  const agentsByPhase = useMemo(() => {
    const grouped: Record<AssignablePhase, AgentDefinition[]> = {
      design: [],
      coding: [],
      testing: [],
      code_review: [],
      manual_testing: [],
    };
    
    for (const agent of agents) {
      if (agent.phase && grouped[agent.phase as AssignablePhase]) {
        grouped[agent.phase as AssignablePhase].push(agent);
      }
    }
    
    return grouped;
  }, [agents]);

  // Check if there are unsaved changes
  const hasChanges = useMemo(() => {
    const original = task.phase_agents ?? {};
    for (const phase of ASSIGNABLE_PHASES) {
      if ((localAssignments[phase] ?? '') !== (original[phase] ?? '')) {
        return true;
      }
    }
    return false;
  }, [localAssignments, task.phase_agents]);

  const handleAssignmentChange = useCallback((phase: AssignablePhase, agentName: string) => {
    setLocalAssignments(prev => {
      const updated = { ...prev };
      if (agentName === '') {
        delete updated[phase];
      } else {
        updated[phase] = agentName;
      }
      return updated;
    });
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase_agents: localAssignments }),
      });
      onUpdate();
    } catch (err) {
      console.error('Failed to save agent assignments:', err);
    } finally {
      setIsSaving(false);
    }
  }, [task.id, localAssignments, onUpdate]);

  const handleReset = useCallback(() => {
    setLocalAssignments(task.phase_agents ?? {});
  }, [task.phase_agents]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-text-secondary">Loading agents...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-red-400">Error loading agents: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-6 space-y-4">
        <div className="text-sm text-text-secondary mb-4">
          Assign specific agents to each phase of this task. If not assigned, the system will use the default agent for that phase.
        </div>

        {ASSIGNABLE_PHASES.map((phase) => {
          const phaseAgents = agentsByPhase[phase];
          const currentAssignment = localAssignments[phase] ?? '';
          const hasAgents = phaseAgents.length > 0;

          return (
            <div
              key={phase}
              className="rounded-lg border border-border bg-bg-card p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-text-primary">
                    {PHASE_LABELS[phase]}
                  </h3>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {PHASE_DESCRIPTIONS[phase]}
                  </p>
                </div>

                <div className="flex-shrink-0 w-48">
                  {hasAgents ? (
                    <select
                      value={currentAssignment}
                      onChange={(e) => handleAssignmentChange(phase, e.target.value)}
                      className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent [&>option]:bg-gray-800 [&>option]:text-white"
                    >
                      <option value="">Use default</option>
                      {phaseAgents.map((agent) => (
                        <option key={agent.name} value={agent.name}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                      <ExclamationTriangleIcon className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                      <span className="text-xs text-yellow-300">No agents</span>
                    </div>
                  )}
                </div>
              </div>

              {currentAssignment && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="text-xs text-text-secondary">
                    Assigned: <span className="text-accent font-medium">{currentAssignment}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer with save button */}
      {hasChanges && (
        <div className="border-t border-border px-6 py-4 bg-bg-secondary">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">
              You have unsaved changes
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={handleReset}
                disabled={isSaving}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-hover transition-colors disabled:opacity-50"
              >
                Reset
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
