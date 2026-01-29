'use client';

import { useState, useMemo, useCallback } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import type { Task, Role, AssignablePhase, CLITool, TaskPhaseOverride } from '@/types';
import { useRoles } from '@/hooks/useRoles';
import { ASSIGNABLE_PHASES } from '@/lib/yaml/schemas';
import { MODELS_BY_CLI, CLI_TOOLS } from '@/lib/constants/models';

interface PhaseOverridesTabProps {
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
  design: 'Override role, CLI tool, or model for the design phase',
  coding: 'Override role, CLI tool, or model for the coding phase',
  testing: 'Override role, CLI tool, or model for the testing phase',
  code_review: 'Override role, CLI tool, or model for the code review phase',
  manual_testing: 'Override role, CLI tool, or model for the manual testing phase',
};

interface LocalOverride {
  role?: string;
  cli_tool?: CLITool;
  model?: string;
}

export function PhaseOverridesTab({ task, onUpdate }: PhaseOverridesTabProps) {
  const { roles, isLoading, error } = useRoles();
  const [localOverrides, setLocalOverrides] = useState<Record<string, LocalOverride>>(
    task.phase_overrides ?? {}
  );
  const [isSaving, setIsSaving] = useState(false);

  // Check if there are unsaved changes
  const hasChanges = useMemo(() => {
    const original = task.phase_overrides ?? {};
    for (const phase of ASSIGNABLE_PHASES) {
      const origOverride = original[phase] ?? {};
      const localOverride = localOverrides[phase] ?? {};
      
      if ((localOverride.role ?? '') !== (origOverride.role ?? '')) return true;
      if ((localOverride.cli_tool ?? '') !== (origOverride.cli_tool ?? '')) return true;
      if ((localOverride.model ?? '') !== (origOverride.model ?? '')) return true;
    }
    return false;
  }, [localOverrides, task.phase_overrides]);

  const handleOverrideChange = useCallback(
    (phase: AssignablePhase, field: keyof LocalOverride, value: string) => {
      setLocalOverrides((prev) => {
        const updated = { ...prev };
        if (!updated[phase]) {
          updated[phase] = {};
        }
        
        if (value === '') {
          delete updated[phase][field];
          // Clean up empty override objects
          if (Object.keys(updated[phase]).length === 0) {
            delete updated[phase];
          }
        } else {
          updated[phase] = { ...updated[phase], [field]: value };
        }
        
        return updated;
      });
    },
    []
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      // Convert local overrides to the proper TaskPhaseOverride format
      const phase_overrides: Record<string, TaskPhaseOverride> = {};
      for (const [phase, override] of Object.entries(localOverrides)) {
        if (override.role || override.cli_tool || override.model) {
          phase_overrides[phase] = {
            role: override.role || undefined,
            cli_tool: override.cli_tool || undefined,
            model: override.model || undefined,
          };
        }
      }

      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase_overrides }),
      });
      onUpdate();
    } catch (err) {
      console.error('Failed to save phase overrides:', err);
    } finally {
      setIsSaving(false);
    }
  }, [task.id, localOverrides, onUpdate]);

  const handleReset = useCallback(() => {
    setLocalOverrides(task.phase_overrides ?? {});
  }, [task.phase_overrides]);

  // Get available models for a CLI tool
  const getModelsForCLI = useCallback((cliTool?: CLITool) => {
    if (!cliTool) return [];
    return MODELS_BY_CLI[cliTool] || [];
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-text-secondary">Loading roles...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-red-400">Error loading roles: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-6 space-y-4">
        <div className="text-sm text-text-secondary mb-4">
          Override the default role, CLI tool, or model for specific phases of this task. 
          Leave empty to use the project defaults.
        </div>

        {roles.length === 0 && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-300">
              No roles configured. Go to Roles page to import templates or create roles.
            </div>
          </div>
        )}

        {ASSIGNABLE_PHASES.map((phase) => {
          const currentOverride = localOverrides[phase] ?? {};
          const models = getModelsForCLI(currentOverride.cli_tool);

          return (
            <div
              key={phase}
              className="rounded-lg border border-border bg-bg-card p-4"
            >
              <div className="mb-3">
                <h3 className="font-medium text-text-primary">
                  {PHASE_LABELS[phase]}
                </h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  {PHASE_DESCRIPTIONS[phase]}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {/* Role Override */}
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Role</label>
                  <select
                    value={currentOverride.role ?? ''}
                    onChange={(e) => handleOverrideChange(phase, 'role', e.target.value)}
                    className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent [&>option]:bg-gray-800 [&>option]:text-white"
                  >
                    <option value="">Use default</option>
                    {roles.map((role) => (
                      <option key={role.name} value={role.name}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* CLI Tool Override */}
                <div>
                  <label className="block text-xs text-text-secondary mb-1">CLI Tool</label>
                  <select
                    value={currentOverride.cli_tool ?? ''}
                    onChange={(e) => {
                      const newCLI = e.target.value as CLITool | '';
                      handleOverrideChange(phase, 'cli_tool', newCLI);
                      // Reset model when CLI changes
                      if (newCLI && currentOverride.model) {
                        const newModels = MODELS_BY_CLI[newCLI];
                        if (!newModels.some(m => m.id === currentOverride.model)) {
                          handleOverrideChange(phase, 'model', '');
                        }
                      }
                    }}
                    className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent [&>option]:bg-gray-800 [&>option]:text-white"
                  >
                    <option value="">Use default</option>
                    {CLI_TOOLS.map((cli) => (
                      <option key={cli} value={cli}>
                        {cli}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Model Override */}
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Model</label>
                  <select
                    value={currentOverride.model ?? ''}
                    onChange={(e) => handleOverrideChange(phase, 'model', e.target.value)}
                    className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent [&>option]:bg-gray-800 [&>option]:text-white"
                    disabled={!currentOverride.cli_tool}
                  >
                    <option value="">Use default</option>
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                  {!currentOverride.cli_tool && currentOverride.model === undefined && (
                    <p className="text-xs text-text-secondary mt-1">
                      Select a CLI tool first
                    </p>
                  )}
                </div>
              </div>

              {/* Show current overrides summary */}
              {(currentOverride.role || currentOverride.cli_tool || currentOverride.model) && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="text-xs text-text-secondary">
                    Overrides: 
                    {currentOverride.role && (
                      <span className="ml-2 text-accent">Role: {currentOverride.role}</span>
                    )}
                    {currentOverride.cli_tool && (
                      <span className="ml-2 text-accent">CLI: {currentOverride.cli_tool}</span>
                    )}
                    {currentOverride.model && (
                      <span className="ml-2 text-accent">Model: {currentOverride.model}</span>
                    )}
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
