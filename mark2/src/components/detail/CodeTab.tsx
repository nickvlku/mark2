'use client';

import { useState, useEffect } from 'react';
import type { Task } from '@/types';

interface CodeTabProps {
  task: Task;
}

export function CodeTab({ task }: CodeTabProps) {
  const [diff, setDiff] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDiff() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/worktrees/${task.id}/diff`);
        if (!res.ok) {
          setError(`Failed to load diff (${res.status})`);
          return;
        }
        const data = await res.json();
        if (!cancelled) setDiff(data.diff ?? '');
      } catch {
        if (!cancelled) setError('Failed to fetch diff');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDiff();
    return () => { cancelled = true; };
  }, [task.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-text-secondary">
        <svg className="h-5 w-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm">Loading diff...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
        <svg className="h-12 w-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
        </svg>
        <p className="text-sm">{error}</p>
        <p className="text-xs mt-1 text-text-secondary/50">Worktree may not exist for this task yet</p>
      </div>
    );
  }

  if (!diff || diff.trim() === '') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
        <svg className="h-12 w-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
        </svg>
        <p className="text-sm">No code changes yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-auto p-4">
      <pre className="rounded-lg border border-border bg-bg-primary p-4 text-xs font-mono leading-relaxed overflow-x-auto">
        {diff.split('\n').map((line, i) => {
          let lineClass = 'text-text-secondary';
          if (line.startsWith('+') && !line.startsWith('+++')) {
            lineClass = 'text-green-400 bg-green-500/10';
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            lineClass = 'text-red-400 bg-red-500/10';
          } else if (line.startsWith('@@')) {
            lineClass = 'text-cyan-400';
          } else if (line.startsWith('diff ') || line.startsWith('index ')) {
            lineClass = 'text-text-secondary/50 font-bold';
          }
          return (
            <div key={i} className={`${lineClass} px-2 -mx-2`}>
              {line || '\u00A0'}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
