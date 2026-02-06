'use client';

import type { Story } from '@/types';

interface StorySectionHeaderProps {
  /** Story data, or null for "Unassigned" section */
  story: Story | null;
  /** Number of tasks completed */
  doneCount: number;
  /** Total number of tasks */
  totalCount: number;
  /** Whether this section is collapsed */
  isCollapsed: boolean;
  /** Toggle collapse state */
  onToggleCollapse: () => void;
  /** Open story sidebar (only for actual stories, not unassigned) */
  onStoryClick?: () => void;
}

export function StorySectionHeader({
  story,
  doneCount,
  totalCount,
  isCollapsed,
  onToggleCollapse,
  onStoryClick,
}: StorySectionHeaderProps) {
  const isUnassigned = story === null;
  const title = isUnassigned ? 'Unassigned' : story.title;
  const storyId = isUnassigned ? null : story.id;

  // Truncate title to ~40 chars
  const truncatedTitle = title.length > 40 ? title.slice(0, 40) + '...' : title;

  const handleHeaderClick = (e: React.MouseEvent) => {
    // If clicking on the chevron button area, don't trigger story sidebar
    if ((e.target as HTMLElement).closest('[data-collapse-toggle]')) {
      return;
    }
    // Only open sidebar for actual stories
    if (!isUnassigned && onStoryClick) {
      onStoryClick();
    }
  };

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 bg-bg-secondary/50 border-b border-border ${
        !isUnassigned && onStoryClick ? 'cursor-pointer hover:bg-bg-hover' : ''
      }`}
      onClick={handleHeaderClick}
    >
      {/* Collapse toggle */}
      <button
        data-collapse-toggle
        onClick={(e) => {
          e.stopPropagation();
          onToggleCollapse();
        }}
        className="p-1 rounded hover:bg-bg-hover transition-colors"
        title={isCollapsed ? 'Expand section' : 'Collapse section'}
      >
        <svg
          className={`h-4 w-4 text-text-secondary transition-transform ${
            isCollapsed ? '-rotate-90' : 'rotate-0'
          }`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Story ID badge */}
      {storyId ? (
        <span className="inline-flex items-center rounded bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-400">
          {storyId}
        </span>
      ) : (
        <span className="inline-flex items-center rounded bg-gray-500/20 px-2 py-0.5 text-xs font-medium text-gray-400">
          Unassigned
        </span>
      )}

      {/* Title */}
      <span className="text-sm font-medium text-text-primary flex-1 truncate">
        {!isUnassigned && truncatedTitle}
      </span>

      {/* Progress badge */}
      <span className="text-xs text-text-secondary shrink-0">
        ({doneCount}/{totalCount} done)
      </span>
    </div>
  );
}
