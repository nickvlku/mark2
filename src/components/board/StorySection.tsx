'use client';

import { useCallback } from 'react';
import type { Task, Story, Phase } from '@/types';
import { StorySectionHeader } from './StorySectionHeader';
import { Column } from './Column';

const PHASES: Phase[] = [
  'pending',
  'design',
  'coding',
  'testing',
  'code_review',
  'fix_review',
  'final_testing',
  'run_test_plan',
  'done',
];

interface StorySectionProps {
  /** Unique key for this section (story ID or '__unassigned__') */
  sectionKey: string;
  /** Story data, or null for "Unassigned" section */
  story: Story | null;
  /** Tasks belonging to this story (or unassigned tasks) */
  tasks: Task[];
  /** Whether this section is collapsed */
  isCollapsed: boolean;
  /** Toggle collapse state */
  onToggleCollapse: () => void;
  /** Open story sidebar (only for actual stories) */
  onStoryClick?: () => void;
  /** Handle card click */
  onCardClick: (task: Task) => void;
  /** Handle archive action */
  onArchive?: (taskId: string) => void;
  /** Handle restore action */
  onRestore?: (taskId: string) => void;
  /** Handle delete action */
  onDelete?: (taskId: string) => void;
  /** Current user email for lock display */
  currentUserEmail?: string;
}

export function StorySection({
  sectionKey,
  story,
  tasks,
  isCollapsed,
  onToggleCollapse,
  onStoryClick,
  onCardClick,
  onArchive,
  onRestore,
  onDelete,
  currentUserEmail,
}: StorySectionProps) {
  // Calculate progress
  const doneCount = tasks.filter((t) => t.phase === 'done').length;
  const totalCount = tasks.length;

  // Group tasks by phase
  const tasksByPhase = useCallback(
    (phase: Phase) => tasks.filter((t) => t.phase === phase),
    [tasks]
  );

  return (
    <div data-story-section={sectionKey} className="border border-border rounded-xl overflow-hidden bg-bg-card mb-4">
      {/* Header */}
      <StorySectionHeader
        story={story}
        doneCount={doneCount}
        totalCount={totalCount}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        onStoryClick={onStoryClick}
      />

      {/* Collapsible board area */}
      {!isCollapsed && (
        <div className="overflow-x-auto">
          <div className="flex gap-3 p-4 min-w-max">
            {PHASES.map((phase) => (
              <Column
                key={phase}
                phase={phase}
                tasks={tasksByPhase(phase)}
                onCardClick={onCardClick}
                onArchive={onArchive}
                onRestore={onRestore}
                onDelete={onDelete}
                currentUserEmail={currentUserEmail}
                droppableIdPrefix={sectionKey}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
