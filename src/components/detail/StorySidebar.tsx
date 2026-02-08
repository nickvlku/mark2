'use client';

import { useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import type { Story, Task } from '@/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface StorySidebarProps {
  story: Story;
  onClose: () => void;
  onTaskClick: (taskId: string) => void;
  onUpdate?: () => void;
}

type TabId = 'overview' | 'tasks' | 'artifacts';

const tabs: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'artifacts', label: 'Artifacts' },
];

export function StorySidebar({ story: initialStory, onClose, onTaskClick, onUpdate }: StorySidebarProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editTitle, setEditTitle] = useState(initialStory.title);
  const [editDescription, setEditDescription] = useState(initialStory.description);

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

  // Calculate progress
  const doneCount = tasks.filter((t) => t.phase === 'done').length;
  const totalCount = tasks.length;
  const progressPercent = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

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

          {activeTab === 'artifacts' && (
            <div className="text-center py-8">
              <p className="text-sm text-text-secondary">
                Story artifacts coming soon
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
