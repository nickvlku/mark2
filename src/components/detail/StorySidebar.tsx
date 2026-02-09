'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import useSWR from 'swr';
import type { Story, Task, Plan } from '@/types';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface StorySidebarProps {
  story: Story;
  onClose: () => void;
  onTaskClick: (taskId: string) => void;
  onUpdate?: () => void;
}

type TabId = 'overview' | 'tasks' | 'artifacts' | 'plan';

function FullscreenModal({ title, content, onClose }: { title: string; content: string; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[90vw] max-w-4xl h-[85vh] bg-bg-primary border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-secondary">
          <h2 className="text-sm font-medium text-text-primary truncate">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors ml-4"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          <MarkdownRenderer content={content} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function StorySidebar({ story: initialStory, onClose, onTaskClick, onUpdate }: StorySidebarProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editTitle, setEditTitle] = useState(initialStory.title);
  const [editDescription, setEditDescription] = useState(initialStory.description);
  const [prdExpanded, setPrdExpanded] = useState(true);
  const [techSpecExpanded, setTechSpecExpanded] = useState(true);
  const [fullscreenArtifact, setFullscreenArtifact] = useState<{ title: string; content: string } | null>(null);
  const [storyActionLoading, setStoryActionLoading] = useState<'start' | 'merge' | null>(null);
  const [storyActionError, setStoryActionError] = useState<string | null>(null);

  // Fetch story data
  const { data: storyData, mutate: mutateStory } = useSWR<{ story: Story }>(
    `/api/stories/${initialStory.id}`,
    fetcher,
    { refreshInterval: 5000, fallbackData: { story: initialStory } }
  );
  const story = storyData?.story ?? initialStory;

  // Fetch tasks for this story
  const { data: tasksData } = useSWR<{ tasks: Task[] }>(
    `/api/tasks?story_id=${story.id}`,
    fetcher,
    { refreshInterval: 5000 }
  );
  const tasks = tasksData?.tasks ?? [];

  // Fetch plan data if story has plan_id
  const { data: planData } = useSWR<Plan>(
    story.plan_id ? `/api/plans/${story.plan_id}` : null,
    (url: string) => fetch(url).then((r) => r.json()).then((d) => d.plan ?? d),
    { refreshInterval: 0 },
  );

  // Fetch PRD content
  const { data: prdData } = useSWR<{ content: string }>(
    story.plan_id ? `/api/plans/${story.plan_id}/artifacts/content?name=prd.md` : null,
    fetcher,
    { refreshInterval: 0 },
  );

  // Fetch tech spec content
  const { data: techSpecData } = useSWR<{ content: string }>(
    story.plan_id ? `/api/plans/${story.plan_id}/artifacts/content?name=tech-spec.md` : null,
    fetcher,
    { refreshInterval: 0 },
  );

  // Build tabs dynamically
  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'tasks', label: 'Tasks' },
    ...(story.plan_id ? [{ id: 'plan' as TabId, label: 'Plan' }] : []),
    { id: 'artifacts', label: 'Artifacts' },
  ];

  // Calculate progress
  const doneCount = tasks.filter((t) => t.phase === 'done').length;
  const totalCount = tasks.length;
  const progressPercent = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;
  const executionStatus = story.execution?.status ?? 'idle';
  const canStartStory = executionStatus === 'idle';
  const canCreateMergePr = executionStatus === 'ready_to_merge';

  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isEditingTitle && !isEditingDescription) {
        onClose();
      }
    },
    [onClose, isEditingTitle, isEditingDescription]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Update edit state when story changes
  useEffect(() => {
    setEditTitle(story.title);
    setEditDescription(story.description);
  }, [story.title, story.description]);

  const handleSaveTitle = async () => {
    if (editTitle === story.title) {
      setIsEditingTitle(false);
      return;
    }

    try {
      await fetch(`/api/stories/${story.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle }),
      });
      mutateStory();
      onUpdate?.();
    } catch (err) {
      console.error('Failed to update story title:', err);
    }
    setIsEditingTitle(false);
  };

  const handleSaveDescription = async () => {
    if (editDescription === story.description) {
      setIsEditingDescription(false);
      return;
    }

    try {
      await fetch(`/api/stories/${story.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: editDescription }),
      });
      mutateStory();
      onUpdate?.();
    } catch (err) {
      console.error('Failed to update story description:', err);
    }
    setIsEditingDescription(false);
  };

  const handleStartStory = async () => {
    setStoryActionLoading('start');
    setStoryActionError(null);
    try {
      const res = await fetch(`/api/stories/${story.id}/run/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to start story');
      }
      await mutateStory();
      onUpdate?.();
    } catch (error: any) {
      setStoryActionError(error?.message ?? String(error));
    } finally {
      setStoryActionLoading(null);
    }
  };

  const handleCreateMergePr = async () => {
    setStoryActionLoading('merge');
    setStoryActionError(null);
    try {
      const res = await fetch(`/api/stories/${story.id}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create merge PR');
      }
      await mutateStory();
      onUpdate?.();
    } catch (error: any) {
      setStoryActionError(error?.message ?? String(error));
    } finally {
      setStoryActionLoading(null);
    }
  };

  // Get phase badge color
  const getPhaseColor = (phase: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-gray-500',
      design: 'bg-violet-500',
      coding: 'bg-blue-500',
      testing: 'bg-amber-500',
      code_review: 'bg-cyan-500',
      fix_review: 'bg-rose-500',
      final_testing: 'bg-emerald-500',
      run_test_plan: 'bg-orange-500',
      done: 'bg-green-500',
    };
    return colors[phase] || 'bg-gray-500';
  };

  return (
    <div className="fixed inset-y-0 left-0 z-40 flex">
      {/* Slide-over Panel - from left */}
      <div className="slide-in-left relative flex w-full max-w-md flex-col border-r border-border bg-bg-secondary shadow-2xl">
        {/* Header */}
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <span className="inline-flex items-center rounded bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-400 mb-2">
                {story.id}
              </span>
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
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Story Run */}
              <div>
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2 block">
                  Story Run
                </label>
                <div className="rounded-lg border border-border bg-bg-primary p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary">Status</span>
                    <span className="text-xs font-medium text-text-primary capitalize">
                      {executionStatus.replaceAll('_', ' ')}
                    </span>
                  </div>
                  {story.execution?.branch_name && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-text-secondary">Branch</span>
                      <span className="text-xs font-mono text-text-primary truncate">
                        {story.execution.branch_name}
                      </span>
                    </div>
                  )}
                  {story.execution?.merge_pr_url && (
                    <a
                      href={story.execution.merge_pr_url}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-xs text-accent hover:text-accent-hover truncate"
                    >
                      {story.execution.merge_pr_url}
                    </a>
                  )}
                  {storyActionError && (
                    <p className="text-xs text-red-400">{storyActionError}</p>
                  )}
                  <div className="flex gap-2">
                    {canStartStory && (
                      <button
                        onClick={handleStartStory}
                        disabled={storyActionLoading !== null}
                        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {storyActionLoading === 'start' ? 'Starting...' : 'Start Story'}
                      </button>
                    )}
                    {canCreateMergePr && (
                      <button
                        onClick={handleCreateMergePr}
                        disabled={storyActionLoading !== null}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {storyActionLoading === 'merge' ? 'Creating PR...' : 'Create Merge PR'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Title */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                    Title
                  </label>
                  {!isEditingTitle && (
                    <button
                      onClick={() => setIsEditingTitle(true)}
                      className="text-xs text-accent hover:text-accent-hover"
                    >
                      Edit
                    </button>
                  )}
                </div>
                {isEditingTitle ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveTitle}
                        className="px-3 py-1 text-xs font-medium rounded bg-accent text-white hover:bg-accent-hover"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditTitle(story.title);
                          setIsEditingTitle(false);
                        }}
                        className="px-3 py-1 text-xs font-medium rounded text-text-secondary hover:text-text-primary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-text-primary">{story.title}</p>
                )}
              </div>

              {/* Description */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                    Description
                  </label>
                  {!isEditingDescription && (
                    <button
                      onClick={() => setIsEditingDescription(true)}
                      className="text-xs text-accent hover:text-accent-hover"
                    >
                      Edit
                    </button>
                  )}
                </div>
                {isEditingDescription ? (
                  <div className="space-y-2">
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={6}
                      className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none resize-none"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveDescription}
                        className="px-3 py-1 text-xs font-medium rounded bg-accent text-white hover:bg-accent-hover"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditDescription(story.description);
                          setIsEditingDescription(false);
                        }}
                        className="px-3 py-1 text-xs font-medium rounded text-text-secondary hover:text-text-primary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-text-primary whitespace-pre-wrap">
                    {story.description || <span className="text-text-secondary italic">No description</span>}
                  </p>
                )}
              </div>

              {/* Progress */}
              <div>
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2 block">
                  Progress
                </label>
                <div className="space-y-2">
                  <div className="h-2 bg-bg-primary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <p className="text-sm text-text-secondary">
                    {doneCount} of {totalCount} tasks done
                  </p>
                </div>
              </div>

              {/* Created */}
              <div>
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2 block">
                  Created
                </label>
                <p className="text-sm text-text-primary">
                  {new Date(story.created_at).toLocaleDateString()} by {story.created_by}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-2">
              {tasks.length === 0 ? (
                <p className="text-sm text-text-secondary text-center py-8">
                  No tasks in this story
                </p>
              ) : (
                tasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => onTaskClick(task.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-accent/50 hover:bg-bg-hover transition-colors text-left"
                  >
                    <span className={`h-2 w-2 rounded-full ${getPhaseColor(task.phase)}`} />
                    <span className="text-xs font-mono text-text-secondary">{task.id}</span>
                    <span className="text-sm text-text-primary flex-1 truncate">{task.title}</span>
                    <span className="text-xs text-text-secondary capitalize">{task.phase}</span>
                  </button>
                ))
              )}
            </div>
          )}

          {activeTab === 'plan' && story.plan_id && (
            <div className="space-y-4">
              {/* Plan header */}
              {planData && (
                <div className="rounded-lg border border-border bg-bg-primary p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center rounded bg-indigo-500/20 px-2 py-0.5 text-xs font-medium text-indigo-400">
                      {planData.id}
                    </span>
                    <span className="text-xs text-text-secondary capitalize">{planData.phase}</span>
                  </div>
                  <h3 className="text-sm font-medium text-text-primary">{planData.title}</h3>
                </div>
              )}

              {/* PRD */}
              <div className="rounded-lg border border-border bg-bg-primary overflow-hidden">
                <button
                  onClick={() => setPrdExpanded(!prdExpanded)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-bg-hover transition-colors"
                >
                  <span className="text-sm font-medium text-text-primary">PRD</span>
                  <div className="flex items-center gap-1">
                    {prdData?.content && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFullscreenArtifact({ title: `${story.plan_id} — PRD`, content: prdData.content });
                        }}
                        className="p-1 text-text-secondary hover:text-text-primary rounded transition-colors"
                        title="Fullscreen"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                        </svg>
                      </button>
                    )}
                    <svg className={`h-4 w-4 text-text-secondary transition-transform ${prdExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </button>
                {prdExpanded && (
                  <div className="px-4 pb-4 border-t border-border">
                    {prdData?.content ? (
                      <div className="mt-3 max-h-64 overflow-auto">
                        <MarkdownRenderer content={prdData.content} />
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-text-secondary italic">No PRD available</p>
                    )}
                  </div>
                )}
              </div>

              {/* Tech Spec */}
              <div className="rounded-lg border border-border bg-bg-primary overflow-hidden">
                <button
                  onClick={() => setTechSpecExpanded(!techSpecExpanded)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-bg-hover transition-colors"
                >
                  <span className="text-sm font-medium text-text-primary">Tech Spec</span>
                  <div className="flex items-center gap-1">
                    {techSpecData?.content && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFullscreenArtifact({ title: `${story.plan_id} — Tech Spec`, content: techSpecData.content });
                        }}
                        className="p-1 text-text-secondary hover:text-text-primary rounded transition-colors"
                        title="Fullscreen"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                        </svg>
                      </button>
                    )}
                    <svg className={`h-4 w-4 text-text-secondary transition-transform ${techSpecExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </button>
                {techSpecExpanded && (
                  <div className="px-4 pb-4 border-t border-border">
                    {techSpecData?.content ? (
                      <div className="mt-3 max-h-64 overflow-auto">
                        <MarkdownRenderer content={techSpecData.content} />
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-text-secondary italic">No tech spec available</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'artifacts' && (
            <div className="text-center py-8">
              <p className="text-sm text-text-secondary">
                Story artifacts coming soon
              </p>
            </div>
          )}
        </div>

        {/* Fullscreen modal for plan artifacts */}
        {fullscreenArtifact && (
          <FullscreenModal
            title={fullscreenArtifact.title}
            content={fullscreenArtifact.content}
            onClose={() => setFullscreenArtifact(null)}
          />
        )}
      </div>
    </div>
  );
}
