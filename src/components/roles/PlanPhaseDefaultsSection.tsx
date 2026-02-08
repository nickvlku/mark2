'use client';

import { useState, useCallback } from 'react';
import { CheckIcon } from '@heroicons/react/24/outline';
import type { Role, CLITool, PhaseDefault } from '@/types';
import { useConfig } from '@/hooks/useConfig';
import { MODELS_BY_CLI, CLI_TOOLS } from '@/lib/constants/models';

const PLAN_PHASES: { id: string; label: string }[] = [
  { id: 'prd', label: 'PRD' },
  { id: 'tech_spec', label: 'Tech Spec' },
  { id: 'task_generation', label: 'Task Generation' },
];

interface PlanPhaseDefaultsSectionProps {
  roles: Role[];
}

interface LocalPlanPhaseDefault {
  role: string;
  cli_tool: CLITool;
  model: string;
}

export function PlanPhaseDefaultsSection({ roles }: PlanPhaseDefaultsSectionProps) {
  const { config, updateConfig, isLoading } = useConfig();
  const [saving, setSaving] = useState(false);
  const [localDefaults, setLocalDefaults] = useState<Record<string, Partial<LocalPlanPhaseDefault>>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const getCurrentDefault = useCallback(
    (phase: string): LocalPlanPhaseDefault => {
      const local = localDefaults[phase];
      const configured = config?.plan_phase_defaults?.[phase];

      if (configured) {
        return {
          role: local?.role ?? configured.role,
          cli_tool: local?.cli_tool ?? configured.cli_tool,
          model: local?.model ?? configured.model,
        };
      }

      return {
        role: local?.role ?? '',
        cli_tool: local?.cli_tool ?? 'claude-code',
        model: local?.model ?? '',
      };
    },
    [config, localDefaults]
  );

  const getModelsForCLI = useCallback((cliTool: CLITool) => {
    return MODELS_BY_CLI[cliTool] || [];
  }, []);

  const handleChange = useCallback(
    (phase: string, field: keyof LocalPlanPhaseDefault, value: string) => {
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
      const newPlanPhaseDefaults: Record<string, PhaseDefault> = { ...config.plan_phase_defaults };

      for (const phase of PLAN_PHASES) {
        const current = getCurrentDefault(phase.id);

        if (current.role && current.cli_tool && current.model) {
          newPlanPhaseDefaults[phase.id] = {
            role: current.role,
            cli_tool: current.cli_tool,
            model: current.model,
            auto_advance: false,
          };
        }
      }

      await updateConfig({ plan_phase_defaults: newPlanPhaseDefaults });
      setLocalDefaults({});
      setHasChanges(false);
    } catch (err) {
      console.error('Failed to save plan phase defaults:', err);
    } finally {
      setSaving(false);
    }
  }, [config, getCurrentDefault, updateConfig]);

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
          <h2 className="text-lg font-semibold text-text-primary">Plan Phase Defaults</h2>
          <p className="text-sm text-text-secondary mt-1">
            Configure the default role, CLI tool, and model for each plan agent phase
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

      <div className="space-y-4">
        {PLAN_PHASES.map((phase) => {
          const current = getCurrentDefault(phase.id);
          const models = getModelsForCLI(current.cli_tool);

          return (
            <div
              key={phase.id}
              className="rounded-lg border border-border bg-bg-secondary p-4"
            >
              <label className="text-sm font-medium text-text-primary mb-3 block">
                {phase.label}
              </label>

              <div className="grid grid-cols-3 gap-3">
                {/* Role Dropdown */}
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Role</label>
                  <select
                    value={current.role}
                    onChange={(e) => handleChange(phase.id, 'role', e.target.value)}
                    className="w-full rounded-md border border-border bg-bg-input px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent [&>option]:bg-gray-800 [&>option]:text-white"
                  >
                    <option value="">Select role...</option>
                    {roles.map((role) => (
                      <option key={role.name} value={role.name}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* CLI Tool Dropdown */}
                <div>
                  <label className="block text-xs text-text-secondary mb-1">CLI Tool</label>
                  <select
                    value={current.cli_tool}
                    onChange={(e) => {
                      const newCLI = e.target.value as CLITool;
                      handleChange(phase.id, 'cli_tool', newCLI);
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
