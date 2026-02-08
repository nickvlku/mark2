'use client';

import useSWR from 'swr';
import type { Task } from '@/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface DependenciesTabProps {
  task: Task;
}

function navigateToTask(taskId: string) {
  window.dispatchEvent(
    new CustomEvent('mark2:navigate-task', { detail: { taskId } }),
  );
}

const phaseColors: Record<string, string> = {
  pending: 'bg-gray-500',
  design: 'bg-violet-500',
  coding: 'bg-blue-500',
  testing: 'bg-amber-500',
  code_review: 'bg-cyan-500',
  fix_review: 'bg-rose-500',
  final_testing: 'bg-emerald-500',
  run_test_plan: 'bg-orange-500',
  done: 'bg-green-500',
};

function TaskRow({ t }: { t: Task }) {
  return (
    <button
      onClick={() => navigateToTask(t.id)}
      className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-accent/50 hover:bg-bg-hover transition-colors text-left"
    >
      <span className={`h-2 w-2 rounded-full shrink-0 ${phaseColors[t.phase] || 'bg-gray-500'}`} />
      <span className="text-xs font-mono text-text-secondary shrink-0">{t.id}</span>
      <span className="text-sm text-text-primary flex-1 truncate">{t.title}</span>
      <span className="text-xs text-text-secondary capitalize shrink-0">{t.phase}</span>
    </button>
  );
}

export function DependenciesTab({ task }: DependenciesTabProps) {
  // Fetch dependencies from server (both directions)
  const { data: depsData } = useSWR<{ blockers: Task[]; blocking: Task[] }>(
    `/api/tasks/${task.id}/blockers`,
    fetcher,
    { refreshInterval: 5000 },
  );

  const blockerTasks = depsData?.blockers ?? [];
  const blockingTasks = depsData?.blocking ?? [];

  const hasBlockers = task.blockers.length > 0;
  const hasBlocking = blockingTasks.length > 0;

  if (!hasBlockers && !hasBlocking) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
          <svg className="h-8 w-8 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
          </svg>
          <p className="text-sm">No dependencies</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Blocked by */}
      {hasBlockers && (
        <section>
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
            Blocked by
          </h3>
          <p className="text-xs text-text-secondary mb-3">
            This task cannot proceed until these tasks are done
          </p>
          <div className="space-y-2">
            {task.blockers.map((blockerId) => {
              const blockerTask = blockerTasks.find((t) => t.id === blockerId);
              if (blockerTask) {
                return <TaskRow key={blockerId} t={blockerTask} />;
              }
              // Blocker task not found (maybe archived) — show ID only
              return (
                <div
                  key={blockerId}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border text-left"
                >
                  <span className="h-2 w-2 rounded-full bg-gray-500 shrink-0" />
                  <span className="text-xs font-mono text-text-secondary">{blockerId}</span>
                  <span className="text-sm text-text-secondary italic flex-1">Not found</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Blocking */}
      {hasBlocking && (
        <section>
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
            Blocking
          </h3>
          <p className="text-xs text-text-secondary mb-3">
            These tasks are waiting for this task to complete
          </p>
          <div className="space-y-2">
            {blockingTasks.map((t) => (
              <TaskRow key={t.id} t={t} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
