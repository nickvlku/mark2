'use client';

import { useState, useCallback } from 'react';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import type { AgentDefinition } from '@/types';
import { useAgents } from '@/hooks/useAgents';
import { CreateAgentDialog } from './CreateAgentDialog';
import { EditAgentDialog } from './EditAgentDialog';
import { Dialog } from '@/components/shared/Dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { PhaseDefaultsSection } from './PhaseDefaultsSection';
import { ImportAgentsDialog } from './ImportAgentsDialog';

export function AgentsPage() {
  const { agents, mutate: mutateAgents, isLoading, error } = useAgents();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentDefinition | null>(null);
  const [deletingAgent, setDeletingAgent] = useState<AgentDefinition | null>(null);

  const handleCreateAgent = useCallback(
    (newAgent: Omit<AgentDefinition, 'timeout_minutes'> & { timeout_minutes?: number }) => {
      const agentWithDefaults: AgentDefinition = {
        timeout_minutes: 60,
        ...newAgent,
      };

      const updatedAgents = [...agents, agentWithDefaults];

      // Optimistic update
      mutateAgents({ agents: updatedAgents }, false);

      fetch('/api/agents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agents: updatedAgents }),
      })
        .then(() => mutateAgents())
        .catch(() => mutateAgents());

      setShowCreateDialog(false);
    },
    [agents, mutateAgents]
  );

  const handleUpdateAgent = useCallback(
    (updatedAgent: AgentDefinition) => {
      const updatedAgents = agents.map((agent) =>
        agent.name === updatedAgent.name ? updatedAgent : agent
      );

      // Optimistic update
      mutateAgents({ agents: updatedAgents }, false);

      fetch('/api/agents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agents: updatedAgents }),
      })
        .then(() => mutateAgents())
        .catch(() => mutateAgents());

      setEditingAgent(null);
    },
    [agents, mutateAgents]
  );

  const handleDeleteAgent = useCallback(() => {
    if (!deletingAgent) return;

    const updatedAgents = agents.filter((agent) => agent.name !== deletingAgent.name);

    // Optimistic update
    mutateAgents({ agents: updatedAgents }, false);

    fetch('/api/agents', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agents: updatedAgents }),
    })
      .then(() => mutateAgents())
      .catch(() => mutateAgents());

    setDeletingAgent(null);
  }, [deletingAgent, agents, mutateAgents]);

  const handleImportAgents = useCallback(
    (newAgents: AgentDefinition[]) => {
      // Filter out agents that already exist (by name)
      const existingNames = new Set(agents.map((a) => a.name));
      const agentsToAdd = newAgents.filter((a) => !existingNames.has(a.name));

      if (agentsToAdd.length === 0) {
        setShowImportDialog(false);
        return;
      }

      const updatedAgents = [...agents, ...agentsToAdd];

      // Optimistic update
      mutateAgents({ agents: updatedAgents }, false);

      fetch('/api/agents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agents: updatedAgents }),
      })
        .then(() => mutateAgents())
        .catch(() => mutateAgents());

      setShowImportDialog(false);
    },
    [agents, mutateAgents]
  );

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-text-secondary">Loading agents...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-red-400">Error loading agents: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Top Bar */}
      <PageHeader
        title="Agents"
        currentPage="agents"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImportDialog(true)}
              className="flex items-center gap-2 rounded-lg border border-border bg-bg-secondary px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-bg-hover transition-colors"
            >
              <SparklesIcon className="h-4 w-4" />
              Import Templates
            </button>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
            >
              <PlusIcon className="h-4 w-4" />
              Create Agent
            </button>
          </div>
        }
      />

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Phase Defaults Section */}
        <PhaseDefaultsSection agents={agents} />

        {/* Agents Grid */}
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-4">All Agents</h2>
          {agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center rounded-lg border border-border bg-bg-card">
              <div className="text-text-secondary mb-4">No agents configured</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowImportDialog(true)}
                  className="flex items-center gap-2 rounded-lg border border-border bg-bg-secondary px-4 py-2 text-sm font-medium text-text-primary hover:bg-bg-hover transition-colors"
                >
                  <SparklesIcon className="h-4 w-4" />
                  Import Templates
                </button>
                <button
                  onClick={() => setShowCreateDialog(true)}
                  className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
                >
                  <PlusIcon className="h-4 w-4" />
                  Create Agent
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.name}
                  agent={agent}
                  onEdit={() => setEditingAgent(agent)}
                  onDelete={() => setDeletingAgent(agent)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {showCreateDialog && (
        <CreateAgentDialog
          existingAgents={agents}
          onClose={() => setShowCreateDialog(false)}
          onCreate={handleCreateAgent}
        />
      )}

      {showImportDialog && (
        <ImportAgentsDialog
          existingAgents={agents}
          onClose={() => setShowImportDialog(false)}
          onImport={handleImportAgents}
        />
      )}

      {editingAgent && (
        <EditAgentDialog
          agent={editingAgent}
          existingAgents={agents}
          onClose={() => setEditingAgent(null)}
          onUpdate={handleUpdateAgent}
        />
      )}

      {deletingAgent && (
        <Dialog
          open={true}
          onClose={() => setDeletingAgent(null)}
          title="Delete Agent"
          description={`Are you sure you want to delete the agent "${deletingAgent.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={handleDeleteAgent}
          variant="danger"
        />
      )}
    </div>
  );
}

interface AgentCardProps {
  agent: AgentDefinition;
  onEdit: () => void;
  onDelete: () => void;
}

function AgentCard({ agent, onEdit, onDelete }: AgentCardProps) {
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

  const getPhaseColor = (phase: string) => {
    switch (phase) {
      case 'design':
        return 'bg-indigo-500/20 text-indigo-300';
      case 'coding':
        return 'bg-emerald-500/20 text-emerald-300';
      case 'testing':
        return 'bg-orange-500/20 text-orange-300';
      case 'code_review':
        return 'bg-cyan-500/20 text-cyan-300';
      case 'manual_testing':
        return 'bg-pink-500/20 text-pink-300';
      default:
        return 'bg-gray-500/20 text-gray-300';
    }
  };

  const formatPhase = (phase: string) => {
    return phase
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div className="rounded-lg border border-border bg-bg-card p-4 hover:bg-bg-hover transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-medium text-text-primary">{agent.name}</h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${getCliToolColor(agent.cli_tool)}`}
            >
              {agent.cli_tool}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${getPhaseColor(agent.phase)}`}
            >
              {formatPhase(agent.phase)}
            </span>
            <span className="text-xs text-text-secondary">{agent.model}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
            title="Edit agent"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-text-secondary hover:text-red-400 hover:bg-bg-hover rounded transition-colors"
            title="Delete agent"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="text-xs text-text-secondary mb-2">
        Timeout: {agent.timeout_minutes} minutes
      </div>

      <div className="text-sm text-text-secondary">
        <div className="font-medium mb-1">Role Prompt:</div>
        <div className="line-clamp-3 text-xs bg-bg-secondary rounded p-2 font-mono">
          {agent.role_prompt}
        </div>
      </div>
    </div>
  );
}
