'use client';

import { useState, useCallback } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { AgentDefinition, AssignablePhase } from '@/types';
import { MODELS_BY_CLI, CLI_TOOLS, type CLITool } from '@/lib/constants/models';
import { ASSIGNABLE_PHASES } from '@/lib/yaml/schemas';

interface CreateAgentDialogProps {
  existingAgents: AgentDefinition[];
  onClose: () => void;
  onCreate: (agent: Omit<AgentDefinition, 'timeout_minutes'> & { timeout_minutes?: number }) => void;
}

const DEFAULT_PROMPTS: Record<CLITool, string> = {
  'claude-code': 'You are a helpful assistant that specializes in software development using Claude Code.',
  'codex-cli': 'You are a helpful assistant that specializes in code generation and analysis using Codex.',
  'gemini-cli': 'You are a helpful assistant that specializes in software development using Gemini.',
  'opencode': 'You are a helpful assistant that specializes in open-source software development.',
};

const PHASE_LABELS: Record<AssignablePhase, string> = {
  design: 'Design',
  coding: 'Coding',
  testing: 'Testing',
  code_review: 'Code Review',
  fix_review: 'Fix Review',
  final_testing: 'Final Testing',
  manual_testing: 'Manual Testing',
};

export function CreateAgentDialog({ existingAgents, onClose, onCreate }: CreateAgentDialogProps) {
  const [formData, setFormData] = useState<{
    name: string;
    cli_tool: CLITool;
    model: string;
    phase: AssignablePhase;
    role_prompt: string;
    timeout_minutes: number;
  }>({
    name: '',
    cli_tool: 'claude-code',
    model: MODELS_BY_CLI['claude-code'][0]?.id ?? '',
    phase: 'coding',
    role_prompt: DEFAULT_PROMPTS['claude-code'],
    timeout_minutes: 60,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const availableModels = MODELS_BY_CLI[formData.cli_tool];

  const validateForm = useCallback(() => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Agent name is required';
    } else if (!/^[a-z0-9-]+$/.test(formData.name)) {
      newErrors.name = 'Agent names must be lowercase alphanumeric with hyphens';
    } else if (existingAgents.some(agent => agent.name === formData.name)) {
      newErrors.name = 'An agent with this name already exists';
    }
    
    if (!formData.model.trim()) {
      newErrors.model = 'Model is required';
    }
    
    if (!formData.role_prompt.trim()) {
      newErrors.role_prompt = 'Role prompt is required';
    }
    
    if (formData.timeout_minutes < 1 || formData.timeout_minutes > 1440) {
      newErrors.timeout_minutes = 'Timeout must be between 1 and 1440 minutes';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, existingAgents]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onCreate(formData);
    }
  }, [formData, onCreate, validateForm]);

  const handleCliToolChange = useCallback((cli_tool: CLITool) => {
    const models = MODELS_BY_CLI[cli_tool];
    setFormData(prev => ({
      ...prev,
      cli_tool,
      role_prompt: prev.role_prompt === DEFAULT_PROMPTS[prev.cli_tool] 
        ? DEFAULT_PROMPTS[cli_tool]
        : prev.role_prompt,
      model: models[0]?.id ?? '', // Reset to first model for new CLI tool
    }));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fade-in absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fade-in relative w-full max-w-2xl rounded-xl border border-border bg-bg-secondary shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-text-primary">Create New Agent</h2>
          <button
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-text-primary transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-6 space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Agent Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-text-primary placeholder-text-secondary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="my-coding-agent"
              autoFocus
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-400">{errors.name}</p>
            )}
          </div>

          {/* CLI Tool */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              CLI Tool
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CLI_TOOLS.map((tool) => (
                <label key={tool} className="flex items-center">
                  <input
                    type="radio"
                    name="cli_tool"
                    value={tool}
                    checked={formData.cli_tool === tool}
                    onChange={(e) => handleCliToolChange(e.target.value as CLITool)}
                    className="sr-only"
                  />
                  <div className={`flex-1 rounded-lg border px-3 py-2 text-sm text-center cursor-pointer transition-colors ${
                    formData.cli_tool === tool
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border bg-bg-primary text-text-secondary hover:bg-bg-hover'
                  }`}>
                    {tool}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Phase */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Phase
            </label>
            <select
              value={formData.phase}
              onChange={(e) => setFormData(prev => ({ ...prev, phase: e.target.value as AssignablePhase }))}
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent [&>option]:bg-gray-800 [&>option]:text-white"
            >
              {ASSIGNABLE_PHASES.map((phase) => (
                <option key={phase} value={phase}>
                  {PHASE_LABELS[phase]}
                </option>
              ))}
            </select>
            {errors.phase && (
              <p className="mt-1 text-sm text-red-400">{errors.phase}</p>
            )}
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Model
            </label>
            <select
              value={formData.model}
              onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent [&>option]:bg-gray-800 [&>option]:text-white"
            >
              {availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}{model.description ? ` - ${model.description}` : ''}
                </option>
              ))}
            </select>
            {errors.model && (
              <p className="mt-1 text-sm text-red-400">{errors.model}</p>
            )}
          </div>

          {/* Timeout */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Timeout (minutes)
            </label>
            <input
              type="number"
              min="1"
              max="1440"
              value={formData.timeout_minutes}
              onChange={(e) => setFormData(prev => ({ ...prev, timeout_minutes: parseInt(e.target.value) || 60 }))}
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-text-primary placeholder-text-secondary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {errors.timeout_minutes && (
              <p className="mt-1 text-sm text-red-400">{errors.timeout_minutes}</p>
            )}
          </div>

          {/* Role Prompt */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Role Prompt
            </label>
            <textarea
              value={formData.role_prompt}
              onChange={(e) => setFormData(prev => ({ ...prev, role_prompt: e.target.value }))}
              className="w-full h-32 rounded-lg border border-border bg-bg-primary px-3 py-2 text-text-primary placeholder-text-secondary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none"
              placeholder="Describe the role and capabilities of this agent..."
            />
            {errors.role_prompt && (
              <p className="mt-1 text-sm text-red-400">{errors.role_prompt}</p>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
          >
            Create Agent
          </button>
        </div>
      </div>
    </div>
  );
}