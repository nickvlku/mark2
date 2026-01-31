'use client';

import { useState, useCallback, useMemo } from 'react';
import { CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import type { AgentDefinition, Config, AssignablePhase } from '@/types';
import { useConfig } from '@/hooks/useConfig';
import { isLegacyPhaseDefault } from '@/lib/yaml/schemas';

const PHASES: { id: AssignablePhase; label: string }[] = [
  { id: 'design', label: 'Design' },
  { id: 'coding', label: 'Coding' },
  { id: 'testing', label: 'Testing' },
  { id: 'code_review', label: 'Code Review' },
  { id: 'fix_review', label: 'Fix Review' },
  { id: 'final_testing', label: 'Final Testing' },
  { id: 'manual_testing', label: 'Manual Testing' },
];

interface PhaseDefaultsSectionProps {
  agents: AgentDefinition[];
}

/**
 * Legacy phase defaults section for the agents page.
 * Uses the old default_agent format. For the new role-based format,
 * see components/roles/PhaseDefaultsSection.tsx
 */
export function PhaseDefaultsSection({ agents }: PhaseDefaultsSectionProps) {
  const { config, updateConfig, isLoading } = useConfig();
  const [saving, setSaving] = useState(false);
  const [localDefaults, setLocalDefaults] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Get the current defaults from config or local state
  const getCurrentDefault = useCallback(
    (phase: AssignablePhase): string => {
      if (localDefaults[phase] !== undefined) {
        return localDefaults[phase];
      }
      const phaseConfig = config?.phase_defaults?.[phase];
      // Only return default_agent if using legacy format
      if (phaseConfig && isLegacyPhaseDefault(phaseConfig)) {
        return phaseConfig.default_agent || '';
      }
      return '';
    },
    [config, localDefaults]
  );

  // Get agents available for a specific phase
  const getAgentsForPhase = useCallback(
    (phase: AssignablePhase): AgentDefinition[] => {
      return agents.filter((agent) => agent.phase === phase);
    },
    [agents]
  );

  // Check if any phase is missing agents
  const phasesWithoutAgents = useMemo(() => {
    return PHASES.filter((p) => getAgentsForPhase(p.id).length === 0).map((p) => p.label);
  }, [getAgentsForPhase]);

  const handleSelectChange = useCallback(
    (phase: AssignablePhase, agentName: string) => {
      setLocalDefaults((prev) => ({
        ...prev,
        [phase]: agentName,
      }));
      setHasChanges(true);
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!config) return;

    setSaving(true);
    try {
      const newPhaseDefaults = { ...config.phase_defaults };

      // Update only the phases that have changes
      for (const [phase, agentName] of Object.entries(localDefaults)) {
        if (agentName) {
          // Get existing config for this phase
          const existing = newPhaseDefaults[phase];
          // Only update if it's legacy format or doesn't exist
          if (!existing || isLegacyPhaseDefault(existing)) {
            newPhaseDefaults[phase] = {
              ...(existing && isLegacyPhaseDefault(existing) ? existing : {}),
              default_agent: agentName,
              timeout_minutes: 60,
              auto_advance: false,
            };
          }
        } else {
          // Clear the default if empty string selected
          const existing = newPhaseDefaults[phase];
          if (existing && isLegacyPhaseDefault(existing)) {
            delete (existing as any).default_agent;
            // If no other settings, remove the phase entry entirely
            if (Object.keys(existing).length === 0) {
              delete newPhaseDefaults[phase];
            }
          }
        }
      }

      await updateConfig({ phase_defaults: newPhaseDefaults });
      setLocalDefaults({});
      setHasChanges(false);
    } catch (err) {
      console.error('Failed to save phase defaults:', err);
    } finally {
      setSaving(false);
    }
  }, [config, localDefaults, updateConfig]);

  const handleReset = useCallback(() => {
    setLocalDefaults({});
    setHasChanges(false);
  }, []);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-bg-card p-4">
        <div className="text-text-secondary">Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Phase Defaults (Legacy)</h2>
          <p className="text-sm text-text-secondary mt-1">
            Set the default agent to use for each development phase.
            For the new role-based configuration, see the Roles page.
          </p>
        </div>
        {hasChanges && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
              disabled={saving}
            >
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              <CheckIcon className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      {phasesWithoutAgents.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3">
          <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-300">
            No agents configured for: {phasesWithoutAgents.join(', ')}. Create agents for these
            phases to enable automatic assignment.
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PHASES.map((phase) => {
          const phaseAgents = getAgentsForPhase(phase.id);
          const currentDefault = getCurrentDefault(phase.id);
          const hasAgents = phaseAgents.length > 0;

          return (
            <div
              key={phase.id}
              className="rounded-lg border border-border bg-bg-secondary p-3"
            >
              <label className="block text-sm font-medium text-text-primary mb-2">
                {phase.label}
              </label>
              {hasAgents ? (
                <select
                  value={currentDefault}
                  onChange={(e) => handleSelectChange(phase.id, e.target.value)}
                  className="w-full rounded-md border border-border bg-bg-input px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent [&>option]:bg-gray-800 [&>option]:text-white"
                >
                  <option value="">No default</option>
                  {phaseAgents.map((agent) => (
                    <option key={agent.name} value={agent.name}>
                      {agent.name} ({agent.model})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-text-secondary italic py-2">
                  No agents for this phase
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
