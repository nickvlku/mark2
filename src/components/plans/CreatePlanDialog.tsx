'use client';

import { useState } from 'react';

interface CreatePlanDialogProps {
  onClose: () => void;
  onCreate: () => void;
}

export function CreatePlanDialog({ onClose, onCreate }: CreatePlanDialogProps) {
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      setError('Prompt is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || undefined,
          prompt: prompt.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Failed to create plan (${res.status})`);
        return;
      }
      onCreate();
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fade-in absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fade-in relative w-full max-w-lg rounded-xl border border-border bg-bg-secondary p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Create Plan</h2>

        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Title <span className="text-text-secondary/50">(optional)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Auto-generated from prompt if blank..."
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:border-accent focus:outline-none transition-colors"
            />
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Prompt <span className="text-red-400">*</span>
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the feature you want to build..."
              rows={6}
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:border-accent focus:outline-none transition-colors resize-none"
              autoFocus
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !prompt.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Creating...' : 'Create Plan'}
          </button>
        </div>
      </div>
    </div>
  );
}
