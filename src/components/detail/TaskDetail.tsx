'use client';

import { useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import type { Task, SessionStatus } from '@/types';
import { Badge } from '../shared/Badge';
import { ActionBar } from '../shared/ActionBar';
import { Dialog } from '../shared/Dialog';
import { EnhanceDialog } from '../shared/EnhanceDialog';
import { PhaseTimeline } from './PhaseTimeline';
import { ArtifactsTab } from './ArtifactsTab';
import { ActivityTab } from './ActivityTab';
import { CodeTab } from './CodeTab';
import { TerminalTab } from './TerminalTab';
import { PhaseOverridesTab } from './PhaseOverridesTab';
import { DevServerPanel } from './DevServerPanel';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface TaskDetailProps {
  task: Task;           // initial snapshot (used for first render)
  onClose: () => void;
  onUpdate: () => void;
}

type TabId = 'artifacts' | 'activity' | 'code' | 'terminal' | 'overrides';

const tabs: { id: TabId; label: string }[] = [
  { id: 'artifacts', label: 'Artifacts' },
  { id: 'activity', label: 'Activity' },
  { id: 'code', label: 'Code' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'overrides', label: 'Overrides' },
];

export function TaskDetail({ task: initialTask, onClose, onUpdate }: TaskDetailProps) {
  const [activeTab, setActiveTab] = useState<TabId>('activity');

  // Confirmation dialog states
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Enhancement dialog states
  const [showEnhanceDialog, setShowEnhanceDialog] = useState(false);
  const [enhanceLoading, setEnhanceLoading] = useState(false);
  const [enhanceResult, setEnhanceResult] = useState<{
    original_title: string;
    original_description: string;
    enhanced_title: string;
    enhanced_description: string;
  } | null>(null);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);

  // Fetch our own copy of the task so parent SWR revalidations don't
  // unmount/remount us and destroy child state (e.g. comment input).
  const { data } = useSWR<{ task: Task & { session_status?: SessionStatus } }>(
    `/api/tasks/${initialTask.id}`,
    fetcher,
    { refreshInterval: 5000, fallbackData: { task: initialTask } },
  );
  const task = data?.task ?? initialTask;
  const sessionStatus = (task as any).session_status as SessionStatus | undefined;

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

  const handleToggleAutoApprove = async (value: boolean) => {
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_approve: value }),
      });
      onUpdate();
    } catch (err) {
      console.error('Failed to toggle auto_approve:', err);
    }
  };

  const handlePhaseAction = async (action: { phase: string; targetBranch?: string } | { restart: true }) => {
    try {
      if ('restart' in action) {
        await fetch(`/api/tasks/${task.id}/phase/restart`, {
          method: 'POST',
        });
      } else {
        await fetch(`/api/tasks/${task.id}/phase`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phase: action.phase,
            ...(action.targetBranch && { target_branch: action.targetBranch }),
          }),
        });
      }
      onUpdate();
    } catch (err) {
      console.error('Phase action failed:', err);
    }
  };

  const handleArchive = () => {
    setShowArchiveConfirm(true);
  };

  const confirmArchive = async () => {
    try {
      await fetch(`/api/tasks/${task.id}/archive`, { method: 'POST' });
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Failed to archive task:', error);
    } finally {
      setShowArchiveConfirm(false);
    }
  };

  const handleRestore = async () => {
    try {
      await fetch(`/api/tasks/${task.id}/restore`, { method: 'POST' });
      onUpdate();
    } catch (error) {
      console.error('Failed to restore task:', error);
    }
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    try {
      await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Failed to delete task:', error);
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  const handleEnhance = async () => {
    setShowEnhanceDialog(true);
    setEnhanceLoading(true);
    setEnhanceError(null);
    setEnhanceResult(null);

    try {
      const res = await fetch(`/api/tasks/${task.id}/enhance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // Use config defaults
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Enhancement failed');
      }

      const result = await res.json();
      setEnhanceResult(result);
    } catch (err: any) {
      setEnhanceError(err.message);
    } finally {
      setEnhanceLoading(false);
    }
  };

  const handleEnhanceRetry = () => {
    handleEnhance();
  };

  const confirmEnhancement = async (title: string, description: string) => {
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      });
      onUpdate();
      setShowEnhanceDialog(false);
      setEnhanceResult(null);
      setEnhanceError(null);
    } catch (err) {
      console.error('Failed to apply enhancement:', err);
      setEnhanceError('Failed to apply enhancement');
    }
  };

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
              {/* Task ID + Priority */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-text-secondary">{task.id}</span>
                <Badge variant="priority" value={task.priority} />
                <Badge variant="phase" value={task.phase} />
                {task.story_id && (
                  <Badge variant="agent" value={task.story_id} />
                )}
              </div>

              {/* Title */}
              <h2 className="text-lg font-semibold text-text-primary leading-tight">
                {task.title}
              </h2>

              {/* Description */}
              {task.description && (
                <p className="mt-1 text-sm text-text-secondary line-clamp-2">
                  {task.description}
                </p>
              )}

              {/* Phase Overrides */}
              {task.phase_overrides && Object.keys(task.phase_overrides).length > 0 && (
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-text-secondary">Overrides:</span>
                  {Object.entries(task.phase_overrides).map(([phase, override]) => {
                    const parts = [];
                    if (override.role) parts.push(override.role);
                    if (override.cli_tool) parts.push(override.cli_tool);
                    if (override.model) parts.push(override.model);
                    return parts.length > 0 ? (
                      <Badge key={phase} variant="agent" value={`${phase}: ${parts.join(', ')}`} />
                    ) : null;
                  })}
                </div>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className="ml-4 rounded-lg p-1.5 text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Phase Timeline */}
        <div className="border-b border-border">
          <PhaseTimeline
            currentPhase={task.phase}
            sessionStatus={sessionStatus}
            autoApprove={task.auto_approve}
          />
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
        <div className="flex-1 min-h-0 overflow-hidden">
          {activeTab === 'artifacts' && <ArtifactsTab task={task} />}
          {activeTab === 'activity' && <ActivityTab task={task} />}
          {activeTab === 'code' && <CodeTab task={task} />}
          {activeTab === 'terminal' && <TerminalTab task={task} />}
          {activeTab === 'overrides' && <PhaseOverridesTab task={task} onUpdate={onUpdate} />}
        </div>

        {/* Dev Server Panel - show when task has a worktree */}
        {task.phase !== 'pending' && (
          <DevServerPanel task={task} />
        )}

        {/* Action Bar */}
        <ActionBar
          task={task}
          onPhaseAction={handlePhaseAction}
          onToggleAutoApprove={handleToggleAutoApprove}
          onArchive={handleArchive}
          onRestore={handleRestore}
          onDelete={handleDelete}
          onEnhance={handleEnhance}
        />
      </div>

      {/* Archive Confirmation Dialog */}
      <Dialog
        open={showArchiveConfirm}
        onClose={() => setShowArchiveConfirm(false)}
        title="Archive Task"
        description={`Archive ${task.id}? It will be hidden from the active tasks view but can be restored later.`}
        confirmLabel="Archive"
        onConfirm={confirmArchive}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Task Permanently"
        description={`Permanently delete ${task.id}? This action cannot be undone and will remove all task data including history and artifacts.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
      />

      {/* Enhancement Dialog */}
      <EnhanceDialog
        open={showEnhanceDialog}
        onClose={() => {
          setShowEnhanceDialog(false);
          setEnhanceResult(null);
          setEnhanceError(null);
        }}
        onConfirm={confirmEnhancement}
        original={{
          title: task.title,
          description: task.description,
        }}
        enhanced={enhanceResult ? {
          title: enhanceResult.enhanced_title,
          description: enhanceResult.enhanced_description,
        } : null}
        loading={enhanceLoading}
        error={enhanceError}
        entityType="task"
        entityId={task.id}
        onRetry={handleEnhanceRetry}
      />
    </div>
  );
}
