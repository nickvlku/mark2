'use client';

import { useState, useCallback, useRef } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { Task, Phase } from '@/types';
import { useTasks } from '@/hooks/useTasks';
import { useStories } from '@/hooks/useStories';
import { useBoardPan } from '@/hooks/useBoardPan';
import { Column } from './Column';
import { StoryFilter } from './StoryFilter';
import { ArchiveFilter } from './ArchiveFilter';
import { Card } from './Card';
import { TaskDetail } from '../detail/TaskDetail';
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
  'manual_testing',
  'done',
];

export function Board() {
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateStory, setShowCreateStory] = useState(false);

  // Confirmation dialog states
  const [confirmArchive, setConfirmArchive] = useState<Task | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null);

  const filters = {
    ...(selectedStoryId ? { story_id: selectedStoryId } : {}),
    archived: showArchived,
  };
  const { tasks, mutate: mutateTasks } = useTasks(filters);
  const { stories, mutate: mutateStories } = useStories();

  // Find the task for initial snapshot — TaskDetail fetches its own data after mount
  const selectedTask = selectedTaskId ? tasks.find((t: Task) => t.id === selectedTaskId) ?? null : null;

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
      const newPhase = over.id as Phase;
      const task = tasks.find((t: Task) => t.id === taskId);
      if (!task || task.phase === newPhase) return;

      // Optimistic update
      mutateTasks(
        (current: { tasks: Task[] } | undefined) => {
          if (!current) return current;
          return {
            tasks: current.tasks.map((t: Task) =>
              t.id === taskId ? { ...t, phase: newPhase } : t,
            ),
          };
        },
        false,
      );

      try {
        await fetch(`/api/tasks/${taskId}/phase`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase: newPhase }),
        });
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

  const handleUpdateDetail = useCallback(() => {
    mutateTasks();
  }, [mutateTasks]);

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

  return (
    <div className="flex h-screen flex-col">
      {/* Top Bar */}
      <PageHeader
        title="Board"
        currentPage="board"
        additionalElements={
          <div className="flex items-center gap-3">
            <StoryFilter
              stories={stories}
              tasks={tasks}
              selectedStoryId={selectedStoryId}
              onSelect={setSelectedStoryId}
            />
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

      {/* Board Columns */}
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

      {/* Task Detail Slide-over — keyed by ID to prevent remount during SWR refetches */}
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
