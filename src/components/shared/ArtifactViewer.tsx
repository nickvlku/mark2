'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { TaskArtifact } from '@/types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ArtifactViewerProps {
  artifact: TaskArtifact;
  taskId: string;
  defaultExpanded?: boolean;
  fillHeight?: boolean;
}

/**
 * Check if an artifact should be rendered as markdown.
 * Checks both name and path for .md or .markdown extensions.
 */
export function isMarkdownArtifact(artifact: TaskArtifact): boolean {
  return (
    artifact.name.endsWith('.md') ||
    artifact.name.endsWith('.markdown') ||
    artifact.path.endsWith('.md') ||
    artifact.path.endsWith('.markdown')
  );
}

interface ArtifactModalProps {
  artifact: TaskArtifact;
  content: string;
  onClose: () => void;
}

function ArtifactModal({ artifact, content, onClose }: ArtifactModalProps) {
  const [mounted, setMounted] = useState(false);
  const isMarkdown = isMarkdownArtifact(artifact);

  useEffect(() => {
    setMounted(true);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!mounted) return null;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal content */}
      <div className="relative w-[90vw] max-w-4xl h-[85vh] bg-bg-primary border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-secondary">
          <div className="flex flex-col min-w-0">
            <h2 className="text-sm font-medium text-text-primary truncate">
              {artifact.name}
            </h2>
            <span className="text-[10px] text-text-secondary font-mono truncate">
              {artifact.path}
            </span>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors ml-4"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {isMarkdown ? (
            <MarkdownRenderer content={content} />
          ) : (
            <pre className="rounded-lg bg-bg-secondary p-4 text-sm text-text-secondary font-mono overflow-x-auto whitespace-pre-wrap">
              {content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

/**
 * A reusable component for displaying a single artifact with expand/collapse
 * and proper markdown rendering.
 */
export function ArtifactViewer({ artifact, taskId, defaultExpanded = false, fillHeight = false }: ArtifactViewerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const loadContent = async () => {
    if (content !== null) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/artifacts?path=${encodeURIComponent(artifact.path)}`);
      if (res.ok) {
        const data = await res.json();
        setContent(data.content ?? '');
      } else {
        setContent('Failed to load content.');
      }
    } catch {
      setContent('Failed to load content.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    if (!expanded) {
      loadContent();
    }
    setExpanded(!expanded);
  };

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    loadContent();
    setShowModal(true);
  };

  const isMarkdown = isMarkdownArtifact(artifact);

  return (
    <>
      <div className={`rounded-lg border border-border flex flex-col ${fillHeight && expanded ? 'flex-1 min-h-0' : ''}`}>
        <button
          onClick={handleToggle}
          className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-bg-hover transition-colors rounded-lg shrink-0"
        >
          <svg
            className="h-4 w-4 text-text-secondary shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-text-primary truncate block">
              {artifact.name}
            </span>
            <span className="text-[10px] text-text-secondary font-mono truncate block">
              {artifact.path}
            </span>
          </div>
          <svg
            className={`h-4 w-4 text-text-secondary transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m19.5 8.25-7.5 7.5-7.5-7.5"
            />
          </svg>
        </button>

        {expanded && (
          <div className={`border-t border-border flex flex-col ${fillHeight ? 'flex-1 min-h-0' : ''}`}>
            {/* Expand button */}
            <div className="flex justify-end px-3 pt-2 shrink-0">
              <button
                onClick={handleExpand}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
                title="Open in fullscreen"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                </svg>
                Expand
              </button>
            </div>

            {/* Preview content */}
            <div className={`px-3 pb-3 pt-1 overflow-y-auto ${fillHeight ? 'flex-1 min-h-0' : 'max-h-60'}`}>
              {loading ? (
                <div className="flex items-center justify-center py-4 text-xs text-text-secondary">
                  Loading...
                </div>
              ) : content !== null ? (
                isMarkdown ? (
                  <MarkdownRenderer content={content} />
                ) : (
                  <pre className="rounded-lg bg-bg-primary p-3 text-xs text-text-secondary font-mono overflow-x-auto whitespace-pre-wrap">
                    {content}
                  </pre>
                )
              ) : (
                <div className="flex items-center justify-center py-4 text-xs text-text-secondary">
                  Click to load content
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen modal */}
      {showModal && content !== null && (
        <ArtifactModal
          artifact={artifact}
          content={content}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
