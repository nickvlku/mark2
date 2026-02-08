'use client';

import { useState } from 'react';
import type { ProposedStory, ProposedTask } from '@/types';
import { ProposedTaskRow } from './ProposedTaskRow';

interface ProposedStorySectionProps {
  story: ProposedStory;
  storyIndex: number;
  onChange: (updated: ProposedStory) => void;
  onRemove: () => void;
}

export function ProposedStorySection({ story, storyIndex, onChange, onRemove }: ProposedStorySectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(story.title);

  const handleTaskChange = (taskIndex: number, updated: ProposedTask) => {
    const newTasks = [...story.tasks];
    newTasks[taskIndex] = updated;
    onChange({ ...story, tasks: newTasks });
  };

  const handleTaskRemove = (taskIndex: number) => {
    const newTasks = story.tasks.filter((_, i) => i !== taskIndex);
    onChange({ ...story, tasks: newTasks });
  };

  const handleTitleSave = () => {
    onChange({ ...story, title: titleValue });
    setEditingTitle(false);
  };

  const handleAddTask = () => {
    const newTask: ProposedTask = {
      title: 'New task',
      description: '',
      priority: 'P2',
      blockers: [],
    };
    onChange({ ...story, tasks: [...story.tasks, newTask] });
  };

  return (
    <div className="rounded-lg border border-border bg-bg-card mb-3">
      {/* Story header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-text-secondary hover:text-text-primary transition-colors"
        >
          <svg
            className={`h-4 w-4 transition-transform ${collapsed ? '' : 'rotate-90'}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
          </svg>
        </button>

        {editingTitle ? (
          <div className="flex-1 flex items-center gap-2">
            <input
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              className="flex-1 bg-bg-primary border border-border rounded px-2 py-1 text-sm text-text-primary font-medium focus:border-accent focus:outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTitleSave();
                if (e.key === 'Escape') { setTitleValue(story.title); setEditingTitle(false); }
              }}
            />
            <button
              onClick={handleTitleSave}
              className="text-xs text-accent hover:text-accent-hover"
            >
              Save
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditingTitle(true)}
            className="flex-1 text-left text-sm font-medium text-text-primary hover:text-accent transition-colors"
          >
            {story.title}
          </button>
        )}

        <span className="text-xs text-text-secondary">
          {story.tasks.length} task{story.tasks.length !== 1 ? 's' : ''}
        </span>

        <button
          onClick={onRemove}
          className="text-xs text-text-secondary hover:text-red-400 px-2 py-1 rounded hover:bg-bg-hover transition-colors"
        >
          Remove Story
        </button>
      </div>

      {/* Tasks list */}
      {!collapsed && (
        <div>
          {story.tasks.map((task, ti) => (
            <ProposedTaskRow
              key={ti}
              task={task}
              index={ti}
              storyIndex={storyIndex}
              onChange={(updated) => handleTaskChange(ti, updated)}
              onRemove={() => handleTaskRemove(ti)}
            />
          ))}

          <button
            onClick={handleAddTask}
            className="w-full px-4 py-2 text-xs text-text-secondary hover:text-accent hover:bg-bg-hover/50 transition-colors text-left"
          >
            + Add Task
          </button>
        </div>
      )}
    </div>
  );
}
