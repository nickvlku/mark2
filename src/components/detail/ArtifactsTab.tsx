'use client';

import type { Task } from '@/types';
import { Badge } from '../shared/Badge';
import { ArtifactViewer } from '../shared/ArtifactViewer';

interface ArtifactsTabProps {
  task: Task;
}

export function ArtifactsTab({ task }: ArtifactsTabProps) {
  // Sort artifacts chronologically (oldest first)
  const sortedArtifacts = [...task.artifacts].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

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
    <div className="flex flex-col gap-2 p-4 h-full overflow-auto">
      {sortedArtifacts.map((artifact, index) => (
        <div key={artifact.path} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge variant="phase" value={artifact.phase} />
            <span className="text-xs text-text-secondary">
              {artifact.name}
            </span>
            <span className="text-xs text-text-secondary/50">
              {new Date(artifact.created_at).toLocaleTimeString()}
            </span>
          </div>
          <ArtifactViewer
            artifact={artifact}
            taskId={task.id}
            fillHeight={index === sortedArtifacts.length - 1}
          />
        </div>
      ))}
    </div>
  );
}
