'use client';

import { useEffect, useRef } from 'react';
import useSWR from 'swr';
import type { Plan, ActivityEntry } from '@/types';
import { useFormattedTimestamp } from '@/hooks/useRelativeTime';

interface PlanActivityTabProps {
  plan: Plan;
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

function ActivityTimestamp({ timestamp }: { timestamp: string }) {
  const formatted = useFormattedTimestamp(timestamp);
  return <>{formatted}</>;
}

export function PlanActivityTab({ plan }: PlanActivityTabProps) {
  const feedRef = useRef<HTMLDivElement>(null);

  const { data } = useSWR<{ entries: ActivityEntry[] }>(
    `/api/plans/${plan.id}/activity`,
    fetcher,
    { refreshInterval: 5000 },
  );

  const entries = data?.entries ?? [];

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [entries.length]);

  return (
    <div className="flex flex-col h-full">
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
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                typeColors[entry.type] ?? 'bg-gray-500/20 text-gray-400'
              }`}
            >
              {typeIcons[entry.type] ?? '?'}
            </div>
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
    </div>
  );
}
