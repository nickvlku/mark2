'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Plan, PlanArtifact } from '@/types';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';

interface PlanArtifactsTabProps {
  plan: Plan;
}

const PLAN_PHASE_ORDER = [
  'prompt', 'prd', 'prd_review', 'tech_spec', 'tech_spec_review', 'task_generation', 'task_review', 'done',
];

function phaseLabel(phase: string): string {
  switch (phase) {
    case 'prd': return 'PRD';
    case 'prd_review': return 'PRD Review';
    case 'tech_spec': return 'Tech Spec';
    case 'tech_spec_review': return 'Tech Spec Review';
    case 'task_generation': return 'Task Generation';
    case 'task_review': return 'Task Review';
    default: return phase.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}

function isMarkdown(artifact: PlanArtifact): boolean {
  return (
    artifact.name.endsWith('.md') ||
    artifact.name.endsWith('.markdown') ||
    artifact.path.endsWith('.md') ||
    artifact.path.endsWith('.markdown')
  );
}

function FullscreenModal({ title, content, onClose }: { title: string; content: string; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
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
    document.body,
  );
}

export function PlanArtifactsTab({ plan }: PlanArtifactsTabProps) {
  const [expandedArtifact, setExpandedArtifact] = useState<string | null>(null);
  const [artifactContent, setArtifactContent] = useState<Record<string, string>>({});
  const [fullscreenArtifact, setFullscreenArtifact] = useState<{ name: string; content: string } | null>(null);

  const groupedArtifacts = PLAN_PHASE_ORDER.reduce(
    (acc, phase) => {
      const phaseArtifacts = plan.artifacts.filter(a => a.phase === phase);
      if (phaseArtifacts.length > 0) {
        acc[phase] = phaseArtifacts;
      }
      return acc;
    },
    {} as Record<string, PlanArtifact[]>,
  );

  const loadContent = async (artifact: PlanArtifact) => {
    const key = artifact.path;
    if (artifactContent[key]) return;

    try {
      const res = await fetch(`/api/plans/${plan.id}/artifacts/content?name=${encodeURIComponent(artifact.name)}`);
      if (res.ok) {
        const data = await res.json();
        setArtifactContent(prev => ({ ...prev, [key]: data.content ?? '' }));
      } else {
        setArtifactContent(prev => ({ ...prev, [key]: 'Failed to load content.' }));
      }
    } catch {
      setArtifactContent(prev => ({ ...prev, [key]: 'Failed to load content.' }));
    }
  };

  const toggleArtifact = (artifact: PlanArtifact, uniqueKey: string) => {
    if (expandedArtifact === uniqueKey) {
      setExpandedArtifact(null);
    } else {
      setExpandedArtifact(uniqueKey);
      loadContent(artifact);
    }
  };

  const handleExpand = (artifact: PlanArtifact) => {
    loadContent(artifact);
    const content = artifactContent[artifact.path];
    if (content) {
      setFullscreenArtifact({ name: artifact.name, content });
    }
  };

  return (
    <div className="space-y-4 p-4 h-full overflow-y-auto">
      {/* Prompt section */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-500/20 text-indigo-400">
            Prompt
          </span>
        </div>
        <div className="rounded-lg border border-border">
          <button
            onClick={() => setExpandedArtifact(expandedArtifact === '__prompt__' ? null : '__prompt__')}
            className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-bg-hover transition-colors rounded-lg"
          >
            <svg className="h-4 w-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
            </svg>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-text-primary truncate block">
                Original Prompt
              </span>
            </div>
            <svg
              className={`h-4 w-4 text-text-secondary transition-transform ${expandedArtifact === '__prompt__' ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {expandedArtifact === '__prompt__' && (
            <div className="border-t border-border px-3 py-3">
              <p className="text-sm text-text-secondary whitespace-pre-wrap">{plan.prompt}</p>
            </div>
          )}
        </div>
      </div>

      {/* Artifacts grouped by phase */}
      {Object.entries(groupedArtifacts).map(([phase, artifacts]) => (
        <div key={phase}>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-500/20 text-indigo-400">
              {phaseLabel(phase)}
            </span>
            <span className="text-xs text-text-secondary">
              {artifacts.length} artifact{artifacts.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-1">
            {artifacts.map((artifact, idx) => {
              const key = `${phase}:${artifact.path}:${idx}`;
              const contentKey = artifact.path;
              const content = artifactContent[contentKey];
              const isMd = isMarkdown(artifact);

              return (
                <div key={key} className="rounded-lg border border-border">
                  <button
                    onClick={() => toggleArtifact(artifact, key)}
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
                      className={`h-4 w-4 text-text-secondary transition-transform ${expandedArtifact === key ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  {expandedArtifact === key && (
                    <div className="border-t border-border">
                      {/* Expand button */}
                      <div className="flex justify-end px-3 pt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExpand(artifact);
                          }}
                          disabled={!content}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors disabled:opacity-50"
                          title="Open in fullscreen"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                          </svg>
                          Expand
                        </button>
                      </div>
                      <div className="px-3 pb-3 pt-1 max-h-60 overflow-y-auto">
                        {content !== undefined ? (
                          isMd ? (
                            <MarkdownRenderer content={content} />
                          ) : (
                            <pre className="rounded-lg bg-bg-primary p-3 text-xs text-text-secondary font-mono overflow-x-auto whitespace-pre-wrap">
                              {content}
                            </pre>
                          )
                        ) : (
                          <div className="flex items-center justify-center py-4 text-xs text-text-secondary">
                            Loading...
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Empty state */}
      {plan.artifacts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
          <svg className="h-12 w-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <p className="text-sm">No artifacts yet</p>
          <p className="text-xs mt-1">Artifacts will appear as agents generate documents</p>
        </div>
      )}

      {/* Fullscreen modal */}
      {fullscreenArtifact && (
        <FullscreenModal
          title={fullscreenArtifact.name}
          content={fullscreenArtifact.content}
          onClose={() => setFullscreenArtifact(null)}
        />
      )}
    </div>
  );
}
