'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Plan } from '@/types';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';

interface PlanArtifactReviewProps {
  plan: Plan;
  onApprove: () => void;
  onRevise: (feedback?: string) => void;
}

const ARTIFACT_NAMES: Record<string, string> = {
  prd_review: 'prd',
  tech_spec_review: 'tech-spec',
};

const ARTIFACT_LABELS: Record<string, string> = {
  prd_review: 'PRD',
  tech_spec_review: 'Technical Specification',
};

function FullscreenModal({ title, content, onClose }: { title: string; content: string; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-[90vw] max-w-4xl h-[85vh] bg-bg-primary border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-secondary">
          <h2 className="text-sm font-medium text-text-primary truncate">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors ml-4"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          <MarkdownRenderer content={content} />
        </div>
      </div>
    </div>,
    document.body
  );
}

export function PlanArtifactReview({ plan, onApprove, onRevise }: PlanArtifactReviewProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);

  const artifactName = ARTIFACT_NAMES[plan.phase] || '';
  const artifactLabel = ARTIFACT_LABELS[plan.phase] || 'Artifact';

  useEffect(() => {
    if (!artifactName) {
      setLoading(false);
      return;
    }

    const fetchArtifact = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/plans/${plan.id}/artifacts/content?name=${artifactName}`);
        if (res.ok) {
          const data = await res.json();
          setContent(data.content);
        } else {
          setContent(null);
        }
      } catch {
        setContent(null);
      } finally {
        setLoading(false);
      }
    };

    fetchArtifact();
  }, [plan.id, plan.phase, artifactName]);

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      onApprove();
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevise = () => {
    if (showFeedback) {
      onRevise(feedback.trim() || undefined);
      setShowFeedback(false);
      setFeedback('');
    } else {
      setShowFeedback(true);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-secondary">
        Loading artifact...
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex items-center justify-center h-64 text-text-secondary">
        No artifact found for this review phase.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Content header with expand button */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="text-xs font-medium text-text-secondary">{artifactLabel}</span>
        <button
          onClick={() => setShowFullscreen(true)}
          className="flex items-center gap-1 px-2 py-1 text-[10px] text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
          title="Open in fullscreen"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
          Expand
        </button>
      </div>

      {/* Rendered markdown content */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        <div className="rounded-lg border border-border bg-bg-primary p-4">
          <MarkdownRenderer content={content} />
        </div>
      </div>

      {/* Feedback input */}
      {showFeedback && (
        <div className="px-4 pb-2">
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Optional feedback for revision..."
            rows={3}
            className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:border-accent focus:outline-none transition-colors resize-none"
            autoFocus
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="border-t border-border px-4 py-3 flex justify-end gap-3">
        <button
          onClick={handleRevise}
          disabled={actionLoading}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-hover transition-colors disabled:opacity-50"
        >
          {showFeedback ? 'Send Feedback & Revise' : 'Revise'}
        </button>
        <button
          onClick={handleApprove}
          disabled={actionLoading}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          {actionLoading ? 'Approving...' : 'Approve'}
        </button>
      </div>

      {/* Fullscreen modal */}
      {showFullscreen && (
        <FullscreenModal
          title={`${plan.id} — ${artifactLabel}`}
          content={content}
          onClose={() => setShowFullscreen(false)}
        />
      )}
    </div>
  );
}
