'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { Task, Phase, Story } from '@/types';
import { useTasks } from '@/hooks/useTasks';
import { useStories } from '@/hooks/useStories';
import { useBoardPan } from '@/hooks/useBoardPan';
import { useConfig } from '@/hooks/useConfig';
import { useNotifications } from '@/hooks/useNotifications';
import { Column } from './Column';
import { ViewModeToggle, ViewMode } from './ViewModeToggle';
import { StorySection } from './StorySection';
import { ArchiveFilter } from './ArchiveFilter';
import { Card } from './Card';
import { TaskDetail } from '../detail/TaskDetail';
import { StorySidebar } from '../detail/StorySidebar';
import { CreateTaskDialog } from '../create/CreateTaskDialog';
import { CreateStoryDialog } from '../create/CreateStoryDialog';
import { PageHeader } from '../shared/PageHeader';
import { Dialog } from '../shared/Dialog';

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

const VIEW_MODE_STORAGE_KEY = 'mark2_board_view_mode';
const UNASSIGNED_KEY = '__unassigned__';

export function Board() {
  // View mode state with localStorage persistence
  const [viewMode, setViewMode] = useState<ViewMode>('flat');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [selectedStoryForSidebar, setSelectedStoryForSidebar] = useState<string | null>(null);

  const [showArchived, setShowArchived] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateStory, setShowCreateStory] = useState(false);

  // Confirmation dialog states
  const [confirmArchive, setConfirmArchive] = useState<Task | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null);

  // Fetch all tasks (no story filter in grouped mode)
  const filters = { archived: showArchived };
  const { tasks, mutate: mutateTasks } = useTasks(filters);
  const { stories, mutate: mutateStories } = useStories();
  const { userEmail } = useConfig();

  // Load view mode from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (stored === 'flat' || stored === 'grouped') {
      setViewMode(stored);
    }
  }, []);

  // Persist view mode to localStorage
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  }, []);

  // Find the task for initial snapshot — TaskDetail fetches its own data after mount
  const selectedTask = selectedTaskId ? tasks.find((t: Task) => t.id === selectedTaskId) ?? null : null;

  // Find the story for sidebar
  const selectedStory = selectedStoryForSidebar
    ? stories.find((s: Story) => s.id === selectedStoryForSidebar) ?? null
    : null;

  // Monitor window focus state for notifications
  const [isWindowFocused, setIsWindowFocused] = useState(true);

  useEffect(() => {
    const handleFocus = () => setIsWindowFocused(true);
    const handleBlur = () => setIsWindowFocused(false);

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Initialize browser notifications
  useNotifications({
    tasks,
    selectedTaskId,
    isWindowFocused,
  });

  // Handle notification clicks - navigate to the task
  useEffect(() => {
    const handleNotificationClick = (event: Event) => {
      const customEvent = event as CustomEvent<{ taskId: string }>;
      if (customEvent.detail?.taskId) {
        setSelectedTaskId(customEvent.detail.taskId);
      }
    };

    window.addEventListener('mark2:notification-click', handleNotificationClick);

    return () => {
      window.removeEventListener('mark2:notification-click', handleNotificationClick);
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  // Pan and keyboard navigation
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const { isPanning, panHandlers } = useBoardPan({
    containerRef: boardContainerRef,
    ignoreSelector: '[data-draggable="true"]',
    scrollAmount: 320,
  });

  const tasksByPhase = useCallback(
    (phase: Phase) => tasks.filter((t: Task) => t.phase === phase),
    [tasks],
  );

  // Group tasks by story for grouped view
  const groupedTasks = useMemo(() => {
    if (viewMode !== 'grouped') return null;

    const groups = new Map<string, Task[]>();

    // Initialize with unassigned
    groups.set(UNASSIGNED_KEY, []);

    // Initialize groups for all stories
    for (const story of stories) {
      groups.set(story.id, []);
    }

    // Distribute tasks to groups
    for (const task of tasks) {
      const key = task.story_id || UNASSIGNED_KEY;
      const group = groups.get(key);
      if (group) {
        group.push(task);
      } else {
        // Task has a story_id that doesn't exist in stories list
        groups.get(UNASSIGNED_KEY)?.push(task);
      }
    }

    return groups;
  }, [viewMode, tasks, stories]);

  // Get ordered story list (unassigned first, then stories by ID)
  const orderedSections = useMemo(() => {
    if (!groupedTasks) return [];

    const sections: Array<{ key: string; story: Story | null; tasks: Task[] }> = [];

    // Add unassigned first
    const unassignedTasks = groupedTasks.get(UNASSIGNED_KEY) || [];
    sections.push({ key: UNASSIGNED_KEY, story: null, tasks: unassignedTasks });

    // Add stories sorted by ID
    const sortedStories = [...stories].sort((a, b) => {
      const numA = parseInt(a.id.replace('STORY-', ''), 10);
      const numB = parseInt(b.id.replace('STORY-', ''), 10);
      return numA - numB;
    });

    for (const story of sortedStories) {
      const storyTasks = groupedTasks.get(story.id) || [];
      sections.push({ key: story.id, story, tasks: storyTasks });
    }

    return sections;
  }, [groupedTasks, stories]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = event.active.data.current?.task as Task | undefined;
    if (task) setActiveTask(task);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveTask(null);
      const { active, over } = event;
      if (!over) return;

      const taskId = active.id as string;
      // Extract phase from droppable data (handles both flat IDs like "coding"
      // and prefixed IDs like "__unassigned__::coding" in grouped view)
      const newPhase = (over.data.current?.phase ?? over.id) as Phase;
      const targetStoryKey: string | null = over.data.current?.storyKey ?? null;
      const task = tasks.find((t: Task) => t.id === taskId);
      if (!task) return;

      // Determine target story_id from droppable story key
      const targetStoryId = targetStoryKey === UNASSIGNED_KEY ? undefined : targetStoryKey;
      const currentStoryId = task.story_id || undefined;
      const phaseChanged = task.phase !== newPhase;
      const storyChanged = targetStoryKey !== null && targetStoryId !== currentStoryId;

      if (!phaseChanged && !storyChanged) return;

      // Optimistic update
      mutateTasks(
        (current: { tasks: Task[] } | undefined) => {
          if (!current) return current;
          return {
            tasks: current.tasks.map((t: Task) =>
              t.id === taskId
                ? {
                    ...t,
                    ...(phaseChanged ? { phase: newPhase } : {}),
                    ...(storyChanged ? { story_id: targetStoryId } : {}),
                  }
                : t,
            ),
          };
        },
        false,
      );

      try {
        const requests: Promise<Response>[] = [];
        if (phaseChanged) {
          requests.push(
            fetch(`/api/tasks/${taskId}/phase`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phase: newPhase }),
            }),
          );
        }
        if (storyChanged) {
          requests.push(
            fetch(`/api/tasks/${taskId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ story_id: targetStoryId ?? null }),
            }),
          );
        }
        await Promise.all(requests);
        mutateTasks();
      } catch {
        mutateTasks();
      }
    },
    [tasks, mutateTasks],
  );

  const handleCardClick = useCallback((task: Task) => {
    setSelectedTaskId(task.id);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedTaskId(null);
  }, []);

  const handleCloseStorySidebar = useCallback(() => {
    setSelectedStoryForSidebar(null);
  }, []);

  const handleUpdateDetail = useCallback(() => {
    mutateTasks();
    mutateStories();
  }, [mutateTasks, mutateStories]);

  const handleArchiveTask = useCallback((taskId: string) => {
    const task = tasks.find((t: Task) => t.id === taskId);
    if (task) setConfirmArchive(task);
  }, [tasks]);

  const handleRestoreTask = useCallback(async (taskId: string) => {
    try {
      await fetch(`/api/tasks/${taskId}/restore`, { method: 'POST' });
      mutateTasks();
    } catch (error) {
      console.error('Failed to restore task:', error);
    }
  }, [mutateTasks]);

  const handleDeleteTask = useCallback((taskId: string) => {
    const task = tasks.find((t: Task) => t.id === taskId);
    if (task) setConfirmDelete(task);
  }, [tasks]);

  const confirmArchiveAction = useCallback(async () => {
    if (!confirmArchive) return;
    try {
      await fetch(`/api/tasks/${confirmArchive.id}/archive`, { method: 'POST' });
      mutateTasks();
    } catch (error) {
      console.error('Failed to archive task:', error);
    } finally {
      setConfirmArchive(null);
    }
  }, [confirmArchive, mutateTasks]);

  const confirmDeleteAction = useCallback(async () => {
    if (!confirmDelete) return;
    try {
      await fetch(`/api/tasks/${confirmDelete.id}`, { method: 'DELETE' });
      mutateTasks();
    } catch (error) {
      console.error('Failed to delete task:', error);
    } finally {
      setConfirmDelete(null);
    }
  }, [confirmDelete, mutateTasks]);

  const toggleSectionCollapse = useCallback((key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  return (
    <div className="flex h-screen flex-col">
      {/* Top Bar */}
      <PageHeader
        title="Board"
        currentPage="board"
        additionalElements={
          <div className="flex items-center gap-3">
            <ViewModeToggle mode={viewMode} onChange={handleViewModeChange} />
            <ArchiveFilter
              showArchived={showArchived}
              onToggle={setShowArchived}
            />
          </div>
        }
        actions={
          <>
            <button
              onClick={() => setShowCreateStory(true)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-bg-hover transition-colors"
            >
              + Story
            </button>
            <button
              onClick={() => setShowCreateTask(true)}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
            >
              + Task
            </button>
          </>
        }
      />

      {/* Board Content */}
      {viewMode === 'flat' ? (
        /* Flat View - original kanban board */
        <div
          ref={boardContainerRef}
          {...panHandlers}
          className={`flex flex-1 gap-3 overflow-x-auto px-4 py-4 ${
            isPanning ? 'cursor-grabbing select-none' : 'cursor-grab'
          }`}
        >
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {PHASES.map((phase) => (
              <Column
                key={phase}
                phase={phase}
                tasks={tasksByPhase(phase)}
                onCardClick={handleCardClick}
                onArchive={showArchived ? undefined : handleArchiveTask}
                onRestore={showArchived ? handleRestoreTask : undefined}
                onDelete={showArchived ? handleDeleteTask : undefined}
                currentUserEmail={userEmail}
              />
            ))}
            <DragOverlay>
              {activeTask ? (
                <div className="rotate-3 scale-105 opacity-90">
                  <Card task={activeTask} onClick={() => {}} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      ) : (
        /* Grouped View - tasks grouped by story */
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {orderedSections.map(({ key, story, tasks: sectionTasks }) => (
              <StorySection
                key={key}
                sectionKey={key}
                story={story}
                tasks={sectionTasks}
                isCollapsed={collapsedSections.has(key)}
                onToggleCollapse={() => toggleSectionCollapse(key)}
                onStoryClick={story ? () => setSelectedStoryForSidebar(story.id) : undefined}
                onCardClick={handleCardClick}
                onArchive={showArchived ? undefined : handleArchiveTask}
                onRestore={showArchived ? handleRestoreTask : undefined}
                onDelete={showArchived ? handleDeleteTask : undefined}
                currentUserEmail={userEmail}
              />
            ))}
            <DragOverlay>
              {activeTask ? (
                <div className="rotate-3 scale-105 opacity-90">
                  <Card task={activeTask} onClick={() => {}} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* Story Sidebar (left side) */}
      {selectedStory && (
        <StorySidebar
          key={selectedStory.id}
          story={selectedStory}
          onClose={handleCloseStorySidebar}
          onTaskClick={(taskId) => setSelectedTaskId(taskId)}
          onUpdate={handleUpdateDetail}
        />
      )}

      {/* Task Detail Slide-over (right side) — keyed by ID to prevent remount during SWR refetches */}
      {selectedTask && (
        <TaskDetail
          key={selectedTask.id}
          task={selectedTask}
          onClose={handleCloseDetail}
          onUpdate={handleUpdateDetail}
        />
      )}

      {/* Create Dialogs */}
      {showCreateTask && (
        <CreateTaskDialog
          stories={stories}
          onClose={() => setShowCreateTask(false)}
          onCreate={() => {
            mutateTasks();
            setShowCreateTask(false);
          }}
        />
      )}
      {showCreateStory && (
        <CreateStoryDialog
          onClose={() => setShowCreateStory(false)}
          onCreate={() => {
            mutateStories();
            setShowCreateStory(false);
          }}
        />
      )}

      {/* Archive Confirmation Dialog */}
      <Dialog
        open={!!confirmArchive}
        onClose={() => setConfirmArchive(null)}
        title="Archive Task"
        description={`Archive ${confirmArchive?.id}? It will be hidden from the active tasks view but can be restored later.`}
        confirmLabel="Archive"
        onConfirm={confirmArchiveAction}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete Task Permanently"
        description={`Permanently delete ${confirmDelete?.id}? This action cannot be undone and will remove all task data including history and artifacts.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDeleteAction}
      />
    </div>
  );
}
