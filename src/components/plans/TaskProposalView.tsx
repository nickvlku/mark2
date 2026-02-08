'use client';

import { useState } from 'react';
import type { Plan, ProposedStory } from '@/types';
import { ProposedStorySection } from './ProposedStorySection';

interface TaskProposalViewProps {
  plan: Plan;
  onConfirm: (stories: ProposedStory[], projectPrefix: string) => void;
  onRegenerate: (feedback?: string) => void;
}

export function TaskProposalView({ plan, onConfirm, onRegenerate }: TaskProposalViewProps) {
  const [stories, setStories] = useState<ProposedStory[]>(
    plan.proposed_stories.map((s) => ({ ...s, tasks: s.tasks.map((t) => ({ ...t })) })),
  );
  const [projectPrefix, setProjectPrefix] = useState(plan.project_prefix || plan.title);
  const [confirming, setConfirming] = useState(false);
  const [showRegenFeedback, setShowRegenFeedback] = useState(false);
  const [regenFeedback, setRegenFeedback] = useState('');

  const totalTasks = stories.reduce((sum, s) => sum + s.tasks.length, 0);

  const handleStoryChange = (index: number, updated: ProposedStory) => {
    const next = [...stories];
    next[index] = updated;
    setStories(next);
  };

  const handleStoryRemove = (index: number) => {
    setStories(stories.filter((_, i) => i !== index));
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm(stories, projectPrefix);
    } finally {
      setConfirming(false);
    }
  };

  const handleRegenerate = () => {
    if (showRegenFeedback) {
      onRegenerate(regenFeedback.trim() || undefined);
      setShowRegenFeedback(false);
      setRegenFeedback('');
    } else {
      setShowRegenFeedback(true);
    }
  };

  if (stories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-secondary">
        <p className="mb-4">No stories proposed yet.</p>
        <button
          onClick={() => onRegenerate()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
        >
          Regenerate
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Proposal content */}
      <div className="flex-1 overflow-auto p-4">
        {/* Project prefix */}
        <div className="mb-4">
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-1 block">
            Project prefix
          </label>
          <input
            type="text"
            value={projectPrefix}
            onChange={(e) => setProjectPrefix(e.target.value)}
            className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none transition-colors"
            placeholder="e.g. Codex Integration"
          />
          <p className="mt-1 text-xs text-text-secondary">
            Story titles will be prefixed as [{projectPrefix}]
          </p>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-text-secondary">
            {stories.length} {stories.length === 1 ? 'story' : 'stories'}, {totalTasks} {totalTasks === 1 ? 'task' : 'tasks'}
          </span>
        </div>

        {stories.map((story, si) => (
          <ProposedStorySection
            key={si}
            story={story}
            storyIndex={si}
            onChange={(updated) => handleStoryChange(si, updated)}
            onRemove={() => handleStoryRemove(si)}
          />
        ))}
      </div>

      {/* Regenerate feedback */}
      {showRegenFeedback && (
        <div className="px-4 pb-2">
          <textarea
            value={regenFeedback}
            onChange={(e) => setRegenFeedback(e.target.value)}
            placeholder="Optional feedback for regeneration..."
            rows={3}
            className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:border-accent focus:outline-none transition-colors resize-none"
            autoFocus
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="border-t border-border px-4 py-3 flex justify-end gap-3">
        <button
          onClick={handleRegenerate}
          disabled={confirming}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-hover transition-colors disabled:opacity-50"
        >
          {showRegenFeedback ? 'Send & Regenerate' : 'Regenerate'}
        </button>
        <button
          onClick={handleConfirm}
          disabled={confirming || stories.length === 0}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {confirming ? 'Creating...' : `Confirm & Create All (${totalTasks} tasks)`}
        </button>
      </div>
    </div>
  );
}
