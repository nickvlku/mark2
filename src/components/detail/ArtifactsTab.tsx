'use client';

import type { Task, TaskArtifact, Phase } from '@/types';
import { Badge } from '../shared/Badge';
import { ArtifactViewer } from '../shared/ArtifactViewer';

interface ArtifactsTabProps {
  task: Task;
}

const phaseOrder: Phase[] = [
  'pending', 'design', 'coding', 'testing', 'code_review', 'fix_review', 'final_testing', 'manual_testing', 'done',
];

export function ArtifactsTab({ task }: ArtifactsTabProps) {
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
    <div className="flex flex-col p-4 h-full overflow-hidden">
      {Object.entries(groupedArtifacts).map(([phase, artifacts], groupIndex, groupArr) => (
        <div key={phase} className={`flex flex-col ${groupIndex < groupArr.length - 1 ? 'mb-4' : 'flex-1 min-h-0'}`}>
          <div className="flex items-center gap-2 mb-2 shrink-0">
            <Badge variant="phase" value={phase} />
            <span className="text-xs text-text-secondary">
              {artifacts.length} artifact{artifacts.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className={`flex flex-col gap-2 ${groupIndex === groupArr.length - 1 ? 'flex-1 min-h-0' : ''}`}>
            {artifacts.map((artifact, artifactIndex, artifactArr) => (
              <ArtifactViewer
                key={artifact.path}
                artifact={artifact}
                taskId={task.id}
                fillHeight={groupIndex === groupArr.length - 1 && artifactIndex === artifactArr.length - 1}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
