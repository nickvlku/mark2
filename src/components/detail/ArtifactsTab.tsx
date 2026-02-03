'use client';

import { useState, useEffect } from 'react';
import type { Task, TaskArtifact, Phase } from '@/types';
import { Badge } from '../shared/Badge';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';

interface ArtifactsTabProps {
  task: Task;
}

const phaseOrder: Phase[] = [
  'pending', 'design', 'coding', 'testing', 'code_review', 'run_test_plan', 'done',
];

export function ArtifactsTab({ task }: ArtifactsTabProps) {
  const [expandedArtifact, setExpandedArtifact] = useState<string | null>(null);
  const [artifactContent, setArtifactContent] = useState<Record<string, string>>({});

  const groupedArtifacts = phaseOrder.reduce(
    (acc, phase) => {
      const phaseArtifacts = task.artifacts.filter((a) => a.phase === phase);
      if (phaseArtifacts.length > 0) {
        acc[phase] = phaseArtifacts;
      }
      return acc;
    },
    {} as Record<string, TaskArtifact[]>,
  );

  const loadArtifactContent = async (artifact: TaskArtifact) => {
    const key = artifact.path;
    if (artifactContent[key]) return;

    try {
      const res = await fetch(`/api/tasks/${task.id}/artifacts?path=${encodeURIComponent(artifact.path)}`);
      if (res.ok) {
        const data = await res.json();
        setArtifactContent((prev) => ({ ...prev, [key]: data.content ?? '' }));
      }
    } catch {
      setArtifactContent((prev) => ({ ...prev, [key]: 'Failed to load content.' }));
    }
  };

  const toggleArtifact = (artifact: TaskArtifact) => {
    const key = artifact.path;
    if (expandedArtifact === key) {
      setExpandedArtifact(null);
    } else {
      setExpandedArtifact(key);
      loadArtifactContent(artifact);
    }
  };

  const isMarkdown = (artifact: TaskArtifact) =>
    artifact.name.endsWith('.md') ||
    artifact.name.endsWith('.markdown') ||
    artifact.path.endsWith('.md') ||
    artifact.path.endsWith('.markdown');

  if (task.artifacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
        <svg className="h-12 w-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
        <p className="text-sm">No artifacts yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 h-full overflow-y-auto">
      {Object.entries(groupedArtifacts).map(([phase, artifacts]) => (
        <div key={phase}>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="phase" value={phase} />
            <span className="text-xs text-text-secondary">
              {artifacts.length} artifact{artifacts.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-1">
            {artifacts.map((artifact) => (
              <div key={artifact.path} className="rounded-lg border border-border">
                <button
                  onClick={() => toggleArtifact(artifact)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-bg-hover transition-colors rounded-lg"
                >
                  <svg className="h-4 w-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
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
                      expandedArtifact === artifact.path ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {expandedArtifact === artifact.path && (
                  <div className="border-t border-border px-3 py-3">
                    {artifactContent[artifact.path] ? (
                      isMarkdown(artifact) ? (
                        <MarkdownRenderer content={artifactContent[artifact.path]} />
                      ) : (
                        <pre className="rounded-lg bg-bg-primary p-3 text-xs text-text-secondary font-mono overflow-x-auto">
                          {artifactContent[artifact.path]}
                        </pre>
                      )
                    ) : (
                      <div className="flex items-center justify-center py-4 text-xs text-text-secondary">
                        Loading...
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
