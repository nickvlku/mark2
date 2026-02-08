'use client';

import { useState } from 'react';
import type { Plan } from '@/lib/yaml/schemas';

const PRIORITY_COLORS: Record<string, string> = {
  P0: 'bg-red-500/20 text-red-300',
  P1: 'bg-orange-500/20 text-orange-300',
  P2: 'bg-blue-500/20 text-blue-300',
  P3: 'bg-gray-500/20 text-gray-300',
};

interface PlanCompleteSummaryProps {
  plan: Plan;
}

export function PlanCompleteSummary({ plan }: PlanCompleteSummaryProps) {
  const [collapsedStories, setCollapsedStories] = useState<Set<number>>(new Set());

  const toggleStory = (index: number) => {
    setCollapsedStories((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // Build task ID map: sequential assignment matches confirm route logic
  let taskIdx = 0;
  const taskIdMap = new Map<string, string>();
  for (let si = 0; si < plan.proposed_stories.length; si++) {
    for (let ti = 0; ti < plan.proposed_stories[si].tasks.length; ti++) {
      if (taskIdx < plan.created_tasks.length) {
        taskIdMap.set(`${si}:${ti}`, plan.created_tasks[taskIdx]);
      }
      taskIdx++;
    }
  }

  const totalTasks = plan.proposed_stories.reduce((sum, s) => sum + s.tasks.length, 0);

  return (
    <div className="flex-1 overflow-auto p-4">
      {/* Success banner */}
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 mb-4">
        <h3 className="text-sm font-medium text-emerald-300 mb-1">Plan Complete</h3>
        <p className="text-xs text-text-secondary">
          Created {plan.created_stories.length} {plan.created_stories.length === 1 ? 'story' : 'stories'} and {plan.created_tasks.length} {plan.created_tasks.length === 1 ? 'task' : 'tasks'} on the board.
        </p>
      </div>

      {/* Stories and tasks — mirrors TaskProposalView layout */}
      {plan.proposed_stories.length > 0 && (
        <div className="mb-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-text-secondary">
              {plan.proposed_stories.length} {plan.proposed_stories.length === 1 ? 'story' : 'stories'}, {totalTasks} {totalTasks === 1 ? 'task' : 'tasks'}
            </span>
          </div>

          {plan.proposed_stories.map((story, si) => {
            const storyId = si < plan.created_stories.length ? plan.created_stories[si] : null;
            const collapsed = collapsedStories.has(si);

            return (
              <div key={si} className="rounded-lg border border-border bg-bg-card mb-3">
                {/* Story header */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                  <button
                    onClick={() => toggleStory(si)}
                    className="text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <svg
                      className={`h-4 w-4 transition-transform ${collapsed ? '' : 'rotate-90'}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
                    </svg>
                  </button>

                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-text-primary">{story.title}</span>
                  </div>

                  {storyId && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/20 text-purple-300">
                      {storyId}
                    </span>
                  )}

                  <span className="text-xs text-text-secondary">
                    {story.tasks.length} task{story.tasks.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Story description */}
                {!collapsed && story.description && (
                  <div className="px-4 py-2 border-b border-border/50">
                    <p className="text-xs text-text-secondary">{story.description}</p>
                  </div>
                )}

                {/* Tasks */}
                {!collapsed && (
                  <div>
                    {story.tasks.map((task, ti) => {
                      const taskId = taskIdMap.get(`${si}:${ti}`);

                      const blockerLabels = task.blockers.map((b) => {
                        let key: string;
                        if (typeof b === 'string' && b.includes(':')) {
                          key = b;
                        } else {
                          key = `${si}:${b}`;
                        }
                        return taskIdMap.get(key) || `#${b}`;
                      });

                      return (
                        <div key={ti} className="border-b border-border/50 last:border-b-0">
                          <div className="flex items-center gap-2 px-4 py-2">
                            {taskId && (
                              <span className="text-[10px] font-mono text-blue-400/70 w-16 shrink-0">
                                {taskId}
                              </span>
                            )}

                            <span className="flex-1 text-sm text-text-primary truncate">
                              {task.title}
                            </span>

                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-medium ${PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.P2}`}
                            >
                              {task.priority}
                            </span>

                            {blockerLabels.length > 0 && (
                              <span className="text-[10px] text-text-secondary/50">
                                blocked by {blockerLabels.join(', ')}
                              </span>
                            )}
                          </div>

                          {task.description && (
                            <div className="px-4 pb-2 pl-20">
                              <p className="text-xs text-text-secondary/70">{task.description}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Fallback if no proposed_stories (old plans) */}
      {plan.proposed_stories.length === 0 && (plan.created_stories.length > 0 || plan.created_tasks.length > 0) && (
        <>
          {plan.created_stories.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-text-primary mb-2">Created Stories</h4>
              <div className="flex flex-wrap gap-2">
                {plan.created_stories.map((id) => (
                  <span key={id} className="px-2 py-1 rounded text-xs font-mono bg-purple-500/20 text-purple-300">
                    {id}
                  </span>
                ))}
              </div>
            </div>
          )}
          {plan.created_tasks.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-text-primary mb-2">Created Tasks</h4>
              <div className="flex flex-wrap gap-2">
                {plan.created_tasks.map((id) => (
                  <span key={id} className="px-2 py-1 rounded text-xs font-mono bg-blue-500/20 text-blue-300">
                    {id}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Original prompt */}
      <div>
        <h4 className="text-sm font-medium text-text-primary mb-2">Original Prompt</h4>
        <p className="text-xs text-text-secondary whitespace-pre-wrap bg-bg-primary rounded-lg p-3 border border-border">
          {plan.prompt}
        </p>
      </div>
    </div>
  );
}
