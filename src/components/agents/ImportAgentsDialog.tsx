'use client';

import { useState, useMemo, useCallback } from 'react';
import { XMarkIcon, CheckIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import type { AgentDefinition, AssignablePhase } from '@/types';
import { AGENT_TEMPLATES, templateToAgent, type AgentTemplate } from '@/lib/constants/default-agents';

const PHASES: { id: AssignablePhase; label: string }[] = [
  { id: 'design', label: 'Design' },
  { id: 'coding', label: 'Coding' },
  { id: 'testing', label: 'Testing' },
  { id: 'code_review', label: 'Code Review' },
  { id: 'manual_testing', label: 'Manual Testing' },
];

interface ImportAgentsDialogProps {
  existingAgents: AgentDefinition[];
  onClose: () => void;
  onImport: (agents: AgentDefinition[]) => void;
}

export function ImportAgentsDialog({ existingAgents, onClose, onImport }: ImportAgentsDialogProps) {
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());
  const [activePhase, setActivePhase] = useState<AssignablePhase>('design');

  const existingNames = useMemo(() => new Set(existingAgents.map((a) => a.name)), [existingAgents]);

  const templatesForPhase = useMemo(
    () => AGENT_TEMPLATES.filter((t) => t.phase === activePhase),
    [activePhase]
  );

  const handleToggleTemplate = useCallback((templateName: string) => {
    setSelectedTemplates((prev) => {
      const next = new Set(prev);
      if (next.has(templateName)) {
        next.delete(templateName);
      } else {
        next.add(templateName);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    const availableTemplates = templatesForPhase.filter((t) => !existingNames.has(t.name));
    const allSelected = availableTemplates.every((t) => selectedTemplates.has(t.name));

    if (allSelected) {
      // Deselect all from this phase
      setSelectedTemplates((prev) => {
        const next = new Set(prev);
        availableTemplates.forEach((t) => next.delete(t.name));
        return next;
      });
    } else {
      // Select all from this phase
      setSelectedTemplates((prev) => {
        const next = new Set(prev);
        availableTemplates.forEach((t) => next.add(t.name));
        return next;
      });
    }
  }, [templatesForPhase, existingNames, selectedTemplates]);

  const handleSelectAllPhases = useCallback(() => {
    const allAvailable = AGENT_TEMPLATES.filter((t) => !existingNames.has(t.name));
    setSelectedTemplates(new Set(allAvailable.map((t) => t.name)));
  }, [existingNames]);

  const handleImport = useCallback(() => {
    const agentsToImport = AGENT_TEMPLATES.filter((t) => selectedTemplates.has(t.name)).map(
      templateToAgent
    );
    onImport(agentsToImport);
  }, [selectedTemplates, onImport]);

  const getPhaseCount = useCallback(
    (phase: AssignablePhase) => {
      const templates = AGENT_TEMPLATES.filter((t) => t.phase === phase);
      const selected = templates.filter((t) => selectedTemplates.has(t.name)).length;
      const available = templates.filter((t) => !existingNames.has(t.name)).length;
      return { selected, available, total: templates.length };
    },
    [selectedTemplates, existingNames]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-bg-primary border border-border rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Import Agent Templates</h2>
            <p className="text-sm text-text-secondary mt-1">
              Select pre-configured agents to add to your project
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-text-primary rounded transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Phase Tabs */}
        <div className="flex items-center gap-1 p-2 border-b border-border bg-bg-secondary overflow-x-auto">
          {PHASES.map((phase) => {
            const counts = getPhaseCount(phase.id);
            const isActive = activePhase === phase.id;
            return (
              <button
                key={phase.id}
                onClick={() => setActivePhase(phase.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                }`}
              >
                {phase.label}
                {counts.selected > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-xs ${
                      isActive ? 'bg-white/20' : 'bg-accent/20 text-accent'
                    }`}
                  >
                    {counts.selected}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {/* Phase Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-text-secondary">
              {templatesForPhase.length} template{templatesForPhase.length !== 1 ? 's' : ''} for{' '}
              {PHASES.find((p) => p.id === activePhase)?.label}
            </div>
            <button
              onClick={handleSelectAll}
              className="text-sm text-accent hover:text-accent-hover transition-colors"
            >
              {templatesForPhase.filter((t) => !existingNames.has(t.name)).every((t) =>
                selectedTemplates.has(t.name)
              )
                ? 'Deselect All'
                : 'Select All'}
            </button>
          </div>

          {/* Template Cards */}
          <div className="space-y-3">
            {templatesForPhase.map((template) => (
              <TemplateCard
                key={template.name}
                template={template}
                selected={selectedTemplates.has(template.name)}
                disabled={existingNames.has(template.name)}
                onToggle={() => handleToggleTemplate(template.name)}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border bg-bg-secondary">
          <div className="flex items-center gap-4">
            <button
              onClick={handleSelectAllPhases}
              className="text-sm text-accent hover:text-accent-hover transition-colors"
            >
              Select All Phases
            </button>
            <span className="text-sm text-text-secondary">
              {selectedTemplates.size} template{selectedTemplates.size !== 1 ? 's' : ''} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={selectedTemplates.size === 0}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckIcon className="h-4 w-4" />
              Import {selectedTemplates.size > 0 ? `(${selectedTemplates.size})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface TemplateCardProps {
  template: AgentTemplate;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}

function TemplateCard({ template, selected, disabled, onToggle }: TemplateCardProps) {
  const getCliToolColor = (cli_tool: string) => {
    switch (cli_tool) {
      case 'claude-code':
        return 'bg-blue-500/20 text-blue-300';
      case 'codex-cli':
        return 'bg-green-500/20 text-green-300';
      case 'gemini-cli':
        return 'bg-yellow-500/20 text-yellow-300';
      case 'opencode':
        return 'bg-purple-500/20 text-purple-300';
      default:
        return 'bg-gray-500/20 text-gray-300';
    }
  };

  return (
    <div
      onClick={disabled ? undefined : onToggle}
      className={`relative rounded-lg border p-4 transition-colors ${
        disabled
          ? 'border-border bg-bg-secondary opacity-60 cursor-not-allowed'
          : selected
            ? 'border-accent bg-accent/5 cursor-pointer'
            : 'border-border bg-bg-card hover:bg-bg-hover cursor-pointer'
      }`}
    >
      {disabled && (
        <div className="absolute top-2 right-2 flex items-center gap-1 text-xs text-text-secondary">
          <InformationCircleIcon className="h-4 w-4" />
          Already exists
        </div>
      )}

      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div
          className={`mt-0.5 h-5 w-5 rounded border flex items-center justify-center flex-shrink-0 ${
            disabled
              ? 'border-border bg-bg-secondary'
              : selected
                ? 'border-accent bg-accent'
                : 'border-border bg-bg-input'
          }`}
        >
          {selected && !disabled && <CheckIcon className="h-3 w-3 text-white" />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-text-primary">{template.name}</h3>
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${getCliToolColor(template.cli_tool)}`}
            >
              {template.cli_tool}
            </span>
            <span className="text-xs text-text-secondary">{template.model}</span>
          </div>

          <p className="text-sm text-text-secondary mt-1">{template.description}</p>

          <div className="mt-2 text-xs text-text-secondary">
            <span className="font-medium">Timeout:</span> {template.timeout_minutes} minutes
          </div>

          <details className="mt-2">
            <summary className="text-xs text-accent cursor-pointer hover:text-accent-hover">
              View role prompt
            </summary>
            <div className="mt-2 text-xs bg-bg-secondary rounded p-2 font-mono whitespace-pre-wrap max-h-32 overflow-auto">
              {template.role_prompt}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
