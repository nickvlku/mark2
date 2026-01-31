'use client';

import { useState, useCallback } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { Task, Phase } from '@/types';
import { useTasks } from '@/hooks/useTasks';
import { useStories } from '@/hooks/useStories';
import { Column } from './Column';
import { StoryFilter } from './StoryFilter';
import { Card } from './Card';
import { TaskDetail } from '../detail/TaskDetail';
import { CreateTaskDialog } from '../create/CreateTaskDialog';
import { CreateStoryDialog } from '../create/CreateStoryDialog';
import { PageHeader } from '../shared/PageHeader';

const PHASES: Phase[] = [
  'pending',
  'design',
  'coding',
  'testing',
  'code_review',
  'manual_testing',
  'done',
];

export function Board() {
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateStory, setShowCreateStory] = useState(false);

  const { tasks, mutate: mutateTasks } = useTasks(
    selectedStoryId ? { story_id: selectedStoryId } : undefined,
  );
  const { stories, mutate: mutateStories } = useStories();

  // Find the task for initial snapshot — TaskDetail fetches its own data after mount
  const selectedTask = selectedTaskId ? tasks.find((t: Task) => t.id === selectedTaskId) ?? null : null;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

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

  return (
    <div className="flex h-screen flex-col">
      {/* Top Bar */}
      <PageHeader
        title="Board"
        currentPage="board"
        additionalElements={
          <StoryFilter
            stories={stories}
            tasks={tasks}
            selectedStoryId={selectedStoryId}
            onSelect={setSelectedStoryId}
          />
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
      <div className="flex flex-1 gap-3 overflow-x-auto px-4 py-4">
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
    </div>
  );
}
