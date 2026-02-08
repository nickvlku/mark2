'use client';

import { useState } from 'react';
import type { ProposedTask, Priority } from '@/types';

interface ProposedTaskRowProps {
  task: ProposedTask;
  index: number;
  storyIndex: number;
  onChange: (updated: ProposedTask) => void;
  onRemove: () => void;
}

const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3'];

const PRIORITY_COLORS: Record<Priority, string> = {
  P0: 'bg-red-500/20 text-red-300',
  P1: 'bg-orange-500/20 text-orange-300',
  P2: 'bg-blue-500/20 text-blue-300',
  P3: 'bg-gray-500/20 text-gray-300',
};

export function ProposedTaskRow({ task, index, storyIndex, onChange, onRemove }: ProposedTaskRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDesc, setEditDesc] = useState(task.description);

  const handleSave = () => {
    onChange({ ...task, title: editTitle, description: editDesc });
    setEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(task.title);
    setEditDesc(task.description);
    setEditing(false);
  };

  const blockerText = task.blockers.length > 0
    ? task.blockers.map((b) => `#${b}`).join(', ')
    : null;

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <div className="flex items-center gap-2 px-4 py-2 hover:bg-bg-hover/50 transition-colors">
        <span className="text-xs font-mono text-text-secondary/50 w-8">
          {storyIndex}:{index}
        </span>

        {editing ? (
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="flex-1 bg-bg-primary border border-border rounded px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex-1 text-left text-sm text-text-primary truncate"
          >
            {task.title}
          </button>
        )}

        <select
          value={task.priority}
          onChange={(e) => onChange({ ...task, priority: e.target.value as Priority })}
          className={`px-2 py-0.5 rounded text-xs font-medium border-0 cursor-pointer ${PRIORITY_COLORS[task.priority]} [&>option]:bg-gray-800 [&>option]:text-white`}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        {blockerText && (
          <span className="text-xs text-text-secondary/50">
            blocked by {blockerText}
          </span>
        )}

        <button
          onClick={() => editing ? handleSave() : setEditing(true)}
          className="text-xs text-text-secondary hover:text-text-primary px-1.5 py-0.5 rounded hover:bg-bg-hover transition-colors"
        >
          {editing ? 'Save' : 'Edit'}
        </button>

        {editing && (
          <button
            onClick={handleCancel}
            className="text-xs text-text-secondary hover:text-text-primary px-1.5 py-0.5 rounded hover:bg-bg-hover transition-colors"
          >
            Cancel
          </button>
        )}

        <button
          onClick={onRemove}
          className="text-xs text-text-secondary hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-bg-hover transition-colors"
        >
          Remove
        </button>
      </div>

      {/* Expanded description */}
      {expanded && !editing && (
        <div className="px-4 pb-2 pl-12">
          <p className="text-xs text-text-secondary whitespace-pre-wrap">{task.description}</p>
        </div>
      )}

      {/* Editing description */}
      {editing && (
        <div className="px-4 pb-2 pl-12">
          <textarea
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            rows={3}
            className="w-full bg-bg-primary border border-border rounded px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none resize-none"
          />
        </div>
      )}
    </div>
  );
}
