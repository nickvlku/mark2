'use client';

import { useState } from 'react';
import type { Task } from '@/types';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';
import { useFormattedTimestamp } from '@/hooks/useRelativeTime';

interface DetailsTabProps {
  task: Task;
  onUpdate: () => void;
}

export function DetailsTab({ task, onUpdate }: DetailsTabProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveField = async (field: 'title' | 'description', value: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }

      onUpdate();
      if (field === 'title') setEditingTitle(false);
      if (field === 'description') setEditingDescription(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, field: 'title' | 'description') => {
    if (e.key === 'Escape') {
      if (field === 'title') {
        setTitle(task.title);
        setEditingTitle(false);
      }
      if (field === 'description') {
        setDescription(task.description);
        setEditingDescription(false);
      }
      setError(null);
    }
  };

  const createdTimestamp = useFormattedTimestamp(task.created_at);
  const updatedTimestamp = useFormattedTimestamp(task.updated_at);
  const phaseEnteredTimestamp = useFormattedTimestamp(task.phase_entered_at);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Error Message */}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Title Section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Title
          </h3>
          {!editingTitle && (
            <button
              onClick={() => setEditingTitle(true)}
              className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
              </svg>
              Edit
            </button>
          )}
        </div>

        {editingTitle ? (
          <div className="space-y-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, 'title')}
              autoFocus
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-base font-medium text-text-primary focus:border-accent focus:outline-none transition-colors"
            />
            <div className="flex gap-2">
              <button
                onClick={() => saveField('title', title)}
                disabled={saving || !title.trim()}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setTitle(task.title);
                  setEditingTitle(false);
                  setError(null);
                }}
                disabled={saving}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <h2 className="text-xl font-semibold text-text-primary leading-tight">
            {task.title}
          </h2>
        )}
      </section>

      {/* Description Section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Description
          </h3>
          {!editingDescription && (
            <button
              onClick={() => setEditingDescription(true)}
              className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
              </svg>
              Edit
            </button>
          )}
        </div>

        {editingDescription ? (
          <div className="space-y-2">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, 'description')}
              rows={8}
              autoFocus
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none transition-colors font-mono"
              placeholder="No description provided"
            />
            <div className="flex gap-2">
              <button
                onClick={() => saveField('description', description)}
                disabled={saving}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setDescription(task.description);
                  setEditingDescription(false);
                  setError(null);
                }}
                disabled={saving}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-bg-primary p-4">
            {task.description ? (
              <MarkdownRenderer content={task.description} />
            ) : (
              <p className="text-sm text-text-secondary italic">
                No description provided
              </p>
            )}
          </div>
        )}
      </section>

      {/* Metadata Section */}
      <section>
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
          Metadata
        </h3>
        <div className="rounded-lg border border-border bg-bg-primary p-4">
          <dl className="space-y-3">
            <div className="flex justify-between items-center">
              <dt className="text-sm text-text-secondary">Created by</dt>
              <dd className="text-sm font-medium text-text-primary">{task.created_by}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-sm text-text-secondary">Created</dt>
              <dd className="text-sm text-text-primary">{createdTimestamp}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-sm text-text-secondary">Last updated</dt>
              <dd className="text-sm text-text-primary">{updatedTimestamp}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-sm text-text-secondary">Phase entered</dt>
              <dd className="text-sm text-text-primary">{phaseEnteredTimestamp}</dd>
            </div>
            {task.story_id && (
              <div className="flex justify-between items-center">
                <dt className="text-sm text-text-secondary">Story</dt>
                <dd className="text-sm font-medium text-text-primary font-mono">{task.story_id}</dd>
              </div>
            )}
            <div className="flex justify-between items-center">
              <dt className="text-sm text-text-secondary">Loop count</dt>
              <dd className="text-sm text-text-primary">{task.loop_count}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
