'use client';

import { useState, useEffect } from 'react';
import type { Task, TaskArtifact, Phase } from '@/types';
import { Badge } from '../shared/Badge';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';
import { FileUploadZone } from '../shared/FileUploadZone';
import { ImagePreview } from '../shared/ImagePreview';
import { isImageType } from '@/lib/utils/upload';
import { mutate } from 'swr';

interface ArtifactsTabProps {
  task: Task;
}

const phaseOrder: Phase[] = [
  'pending', 'design', 'coding', 'testing', 'code_review', 'run_test_plan', 'done',
];

export function ArtifactsTab({ task }: ArtifactsTabProps) {
  const [expandedArtifact, setExpandedArtifact] = useState<string | null>(null);
  const [artifactContent, setArtifactContent] = useState<Record<string, string>>({});

  // Separate user-uploaded artifacts
  const uploadedArtifacts = task.artifacts.filter((a) => a.source === 'user');
  const agentArtifacts = task.artifacts.filter((a) => a.source !== 'user');

  const groupedArtifacts = phaseOrder.reduce(
    (acc, phase) => {
      const phaseArtifacts = agentArtifacts.filter((a) => a.phase === phase);
      if (phaseArtifacts.length > 0) {
        acc[phase] = phaseArtifacts;
      }
      return acc;
    },
    {} as Record<string, TaskArtifact[]>,
  );

  const handleUploadComplete = () => {
    // Refresh task data to show new artifacts
    mutate(`/api/tasks/${task.id}`);
  };

  const handleUploadError = (error: string) => {
    console.error('Upload error:', error);
  };

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

  return (
    <div className="space-y-4 p-4 h-full overflow-y-auto">
      {/* File Upload Zone */}
      <FileUploadZone
        taskId={task.id}
        onUploadComplete={handleUploadComplete}
        onError={handleUploadError}
      />

      {/* Uploaded Files Section */}
      {uploadedArtifacts.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <svg className="h-4 w-4 text-accent-blue" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            <span className="text-sm font-semibold text-text-primary">Uploaded Files</span>
            <Badge variant="phase" value={`${uploadedArtifacts.length}`} />
          </div>
          <div className="space-y-3">
            {uploadedArtifacts.map((artifact) => (
              <div key={artifact.path} className="rounded-lg border border-border p-3 bg-bg-secondary">
                <div className="flex items-start gap-3 mb-2">
                  {isImageType(artifact.mime_type) ? (
                    <svg className="h-4 w-4 text-accent-blue shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4 text-text-secondary shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-text-primary">
                      {artifact.original_filename || artifact.name}
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="phase" value={artifact.phase} />
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-accent-blue/10 text-accent-blue">
                        Uploaded by user
                      </span>
                    </div>
                  </div>
                </div>

                {/* Render image inline */}
                {isImageType(artifact.mime_type) && (
                  <div className="mt-3">
                    <ImagePreview artifact={artifact} taskId={task.id} />
                  </div>
                )}

                {/* For non-image files, show expandable content */}
                {!isImageType(artifact.mime_type) && (
                  <>
                    <button
                      onClick={() => toggleArtifact(artifact)}
                      className="mt-2 text-xs text-accent-blue hover:underline"
                    >
                      {expandedArtifact === artifact.path ? 'Hide content' : 'Show content'}
                    </button>
                    {expandedArtifact === artifact.path && (
                      <div className="mt-2 pt-2 border-t border-border">
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
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent-Generated Artifacts by Phase */}
      {Object.keys(groupedArtifacts).length > 0 && (
        <div className="space-y-4">
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
      )}

      {/* Empty state */}
      {task.artifacts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
          <svg className="h-12 w-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <p className="text-sm">No artifacts yet</p>
          <p className="text-xs mt-1">Upload files using the zone above</p>
        </div>
      )}
    </div>
  );
}
