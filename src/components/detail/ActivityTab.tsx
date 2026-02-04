'use client';

import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';
import type { Task, ActivityEntry } from '@/types';
import { useFormattedTimestamp } from '@/hooks/useRelativeTime';

interface ActivityTabProps {
  task: Task;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const typeIcons: Record<string, string> = {
  note: 'N',
  phase_change: 'P',
  artifact: 'A',
  error: 'E',
  comment: 'C',
};

const typeColors: Record<string, string> = {
  note: 'bg-blue-500/20 text-blue-400',
  phase_change: 'bg-indigo-500/20 text-indigo-400',
  artifact: 'bg-green-500/20 text-green-400',
  error: 'bg-red-500/20 text-red-400',
  comment: 'bg-amber-500/20 text-amber-400',
};

/** Wrapper component to use the timestamp hook inside a list */
function ActivityTimestamp({ timestamp }: { timestamp: string }) {
  const formatted = useFormattedTimestamp(timestamp);
  return <>{formatted}</>;
}

export function ActivityTab({ task }: ActivityTabProps) {
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  const { data, mutate } = useSWR<{ entries: ActivityEntry[] }>(
    `/api/tasks/${task.id}/activity`,
    fetcher,
    { refreshInterval: 5000 },
  );

  const entries = data?.entries ?? [];

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [entries.length]);

  const handleSubmitComment = async () => {
    if (!comment.trim() || submitting) return;
    setSubmitting(true);
    try {
      await fetch(`/api/tasks/${task.id}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'human',
          type: 'comment',
          message: comment.trim(),
        }),
      });
      setComment('');
      mutate();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Activity Feed */}
      <div ref={feedRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
            <svg className="h-12 w-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <p className="text-sm">No activity yet</p>
          </div>
        )}

        {entries.map((entry, i) => (
          <div key={i} className="flex gap-3">
            {/* Icon */}
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                typeColors[entry.type] ?? 'bg-gray-500/20 text-gray-400'
              }`}
            >
              {typeIcons[entry.type] ?? '?'}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-semibold text-text-primary">
                  {entry.source}
                </span>
                <span className="text-[10px] text-text-secondary">
                  <ActivityTimestamp timestamp={entry.timestamp} />
                </span>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">
                {entry.message}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Comment Input */}
      <div className="border-t border-border p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitComment(); }}
            placeholder="Add a comment..."
            className="flex-1 rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:border-accent focus:outline-none transition-colors"
          />
          <button
            onClick={handleSubmitComment}
            disabled={!comment.trim() || submitting}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
