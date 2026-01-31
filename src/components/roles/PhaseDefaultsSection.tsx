'use client';

import { useState, useCallback, useMemo } from 'react';
import { CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import type { Role, Config, AssignablePhase, CLITool, PhaseDefault } from '@/types';
import { useConfig } from '@/hooks/useConfig';
import { MODELS_BY_CLI, CLI_TOOLS } from '@/lib/constants/models';
import { isNewPhaseDefault } from '@/lib/yaml/schemas';

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
  roles: Role[];
}

interface LocalPhaseDefault {
  role: string;
  cli_tool: CLITool;
  model: string;
  auto_advance: boolean;
}

export function PhaseDefaultsSection({ roles }: PhaseDefaultsSectionProps) {
  const { config, updateConfig, isLoading } = useConfig();
  const [saving, setSaving] = useState(false);
  const [localDefaults, setLocalDefaults] = useState<Record<string, Partial<LocalPhaseDefault>>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Get the current defaults from config or local state
  const getCurrentDefault = useCallback(
    (phase: AssignablePhase): LocalPhaseDefault => {
      const local = localDefaults[phase];
      const configured = config?.phase_defaults?.[phase];

      // Check if configured value is in new format
      if (configured && isNewPhaseDefault(configured)) {
        return {
          role: local?.role ?? configured.role,
          cli_tool: local?.cli_tool ?? configured.cli_tool,
          model: local?.model ?? configured.model,
          auto_advance: local?.auto_advance ?? configured.auto_advance ?? false,
        };
      }

      // No config or legacy format - return empty/local values
      return {
        role: local?.role ?? '',
        cli_tool: local?.cli_tool ?? 'claude-code',
        model: local?.model ?? '',
        auto_advance: local?.auto_advance ?? false,
      };
    },
    [config, localDefaults]
  );

  // Get roles that suggest a particular phase
  const getRolesForPhase = useCallback(
    (phase: AssignablePhase): Role[] => {
      // First include roles that suggest this phase
      const suggested = roles.filter((role) => role.suggested_phases.includes(phase));
      // Then include all other roles
      const others = roles.filter((role) => !role.suggested_phases.includes(phase));
      return [...suggested, ...others];
    },
    [roles]
  );

  // Get available models for the selected CLI tool
  const getModelsForCLI = useCallback((cliTool: CLITool) => {
    return MODELS_BY_CLI[cliTool] || [];
  }, []);

  // Check if any phase is missing roles
  const phasesWithoutRoles = useMemo(() => {
    return PHASES.filter((p) => getRolesForPhase(p.id).length === 0).map((p) => p.label);
  }, [getRolesForPhase]);

  const handleChange = useCallback(
    (phase: AssignablePhase, field: keyof LocalPhaseDefault, value: string | boolean) => {
      setLocalDefaults((prev) => ({
        ...prev,
        [phase]: {
          ...prev[phase],
          [field]: value,
        },
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

      // Update each phase that has local changes
      for (const phase of PHASES) {
        const current = getCurrentDefault(phase.id);
        
        // Only save if role is selected (required field)
        if (current.role && current.cli_tool && current.model) {
          const phaseDefault: PhaseDefault = {
            role: current.role,
            cli_tool: current.cli_tool,
            model: current.model,
            auto_advance: current.auto_advance,
          };
          newPhaseDefaults[phase.id] = phaseDefault;
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
  }, [config, localDefaults, updateConfig, getCurrentDefault]);

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
          <h2 className="text-lg font-semibold text-text-primary">Phase Defaults</h2>
          <p className="text-sm text-text-secondary mt-1">
            Configure the default role, CLI tool, and model for each phase
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

      {phasesWithoutRoles.length > 0 && roles.length === 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3">
          <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-300">
            No roles configured. Import role templates or create roles to enable phase configuration.
          </div>
        </div>
      )}

      <div className="space-y-4">
        {PHASES.map((phase) => {
          const phaseRoles = getRolesForPhase(phase.id);
          const current = getCurrentDefault(phase.id);
          const models = getModelsForCLI(current.cli_tool);
          const hasRoles = phaseRoles.length > 0;

          return (
            <div
              key={phase.id}
              className="rounded-lg border border-border bg-bg-secondary p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-text-primary">
                  {phase.label}
                </label>
                <label className="flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={current.auto_advance}
                    onChange={(e) => handleChange(phase.id, 'auto_advance', e.target.checked)}
                    className="rounded border-border"
                  />
                  Auto-advance
                </label>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {/* Role Dropdown */}
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Role</label>
                  {hasRoles ? (
                    <select
                      value={current.role}
                      onChange={(e) => handleChange(phase.id, 'role', e.target.value)}
                      className="w-full rounded-md border border-border bg-bg-input px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent [&>option]:bg-gray-800 [&>option]:text-white"
                    >
                      <option value="">Select role...</option>
                      {phaseRoles.map((role) => (
                        <option key={role.name} value={role.name}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-sm text-text-secondary italic py-2">
                      No roles available
                    </div>
                  )}
                </div>

                {/* CLI Tool Dropdown */}
                <div>
                  <label className="block text-xs text-text-secondary mb-1">CLI Tool</label>
                  <select
                    value={current.cli_tool}
                    onChange={(e) => {
                      const newCLI = e.target.value as CLITool;
                      handleChange(phase.id, 'cli_tool', newCLI);
                      // Reset model when CLI changes
                      const newModels = MODELS_BY_CLI[newCLI];
                      if (newModels.length > 0) {
                        handleChange(phase.id, 'model', newModels[0].id);
                      }
                    }}
                    className="w-full rounded-md border border-border bg-bg-input px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent [&>option]:bg-gray-800 [&>option]:text-white"
                  >
                    {CLI_TOOLS.map((cli) => (
                      <option key={cli} value={cli}>
                        {cli}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Model Dropdown */}
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Model</label>
                  <select
                    value={current.model}
                    onChange={(e) => handleChange(phase.id, 'model', e.target.value)}
                    className="w-full rounded-md border border-border bg-bg-input px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent [&>option]:bg-gray-800 [&>option]:text-white"
                  >
                    <option value="">Select model...</option>
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
