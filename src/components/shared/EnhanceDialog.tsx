'use client';

import { useState, useEffect, useCallback } from 'react';

interface EnhanceDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (title: string, description: string) => void;
  original: {
    title: string;
    description: string;
  };
  enhanced: {
    title: string;
    description: string;
  } | null;
  loading: boolean;
  error: string | null;
  entityType: 'task' | 'story';
  entityId: string;
  onRetry: () => void;
}

export function EnhanceDialog({
  open,
  onClose,
  onConfirm,
  original,
  enhanced,
  loading,
  error,
  entityType,
  entityId,
  onRetry,
}: EnhanceDialogProps) {
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');

  // Update edited values when enhanced result changes
  useEffect(() => {
    if (enhanced) {
      setEditedTitle(enhanced.title);
      setEditedDescription(enhanced.description);
    }
  }, [enhanced]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  const handleConfirm = () => {
    if (enhanced && editedTitle && editedDescription) {
      onConfirm(editedTitle, editedDescription);
      // Note: Parent component (TaskDetail/StoryDetail) handles closing the dialog
      // after the confirmation action succeeds. Do not call onClose() here.
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="enhance-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div
        className="fade-in absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fade-in relative w-full max-w-5xl max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-bg-secondary p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 id="enhance-dialog-title" className="text-lg font-semibold text-text-primary">
            Enhance {entityId}
          </h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500" />
            <p className="mt-4 text-sm text-text-secondary">Enhancing with AI...</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={onRetry}
              className="mt-3 rounded-lg bg-red-600 hover:bg-red-500 px-3 py-1.5 text-sm font-medium text-white transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && enhanced && (
          <>
            {/* Title Section */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-text-primary mb-3">Title</h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Original Title */}
                <div>
                  <label className="block text-xs text-text-secondary mb-2">Original</label>
                  <div className="rounded-lg border border-border bg-bg-primary p-3 min-h-[60px]">
                    <p className="text-sm text-text-secondary">{original.title}</p>
                  </div>
                </div>

                {/* Enhanced Title (Editable) */}
                <div>
                  <label className="block text-xs text-text-secondary mb-2">Enhanced (editable)</label>
                  <textarea
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    className="w-full rounded-lg border border-border bg-bg-primary p-3 text-sm text-text-primary resize-none min-h-[60px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    rows={2}
                  />
                </div>
              </div>
            </div>

            {/* Description Section */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-text-primary mb-3">Description</h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Original Description */}
                <div>
                  <label className="block text-xs text-text-secondary mb-2">Original</label>
                  <div className="rounded-lg border border-border bg-bg-primary p-3 min-h-[200px] max-h-[400px] overflow-y-auto">
                    <pre className="text-sm text-text-secondary whitespace-pre-wrap font-sans">
                      {original.description || '(no description)'}
                    </pre>
                  </div>
                </div>

                {/* Enhanced Description (Editable) */}
                <div>
                  <label className="block text-xs text-text-secondary mb-2">Enhanced (editable)</label>
                  <textarea
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    className="w-full rounded-lg border border-border bg-bg-primary p-3 text-sm text-text-primary resize-none min-h-[200px] max-h-[400px] focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    rows={12}
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button
                onClick={onClose}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onRetry}
                className="rounded-lg border border-purple-500/50 bg-purple-500/10 px-4 py-2 text-sm font-medium text-purple-300 hover:bg-purple-500/20 transition-colors"
              >
                Enhance Again
              </button>
              <button
                onClick={handleConfirm}
                disabled={!editedTitle || !editedDescription}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition-colors"
              >
                Apply
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
