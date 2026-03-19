'use client';

import type { Task } from '@/types';
import { LiveTerminal } from '@/components/shared/LiveTerminal';

interface TerminalTabProps {
  task: Task;
}

export function TerminalTab({ task }: TerminalTabProps) {
  return (
    <LiveTerminal
      targetKind="task"
      targetId={task.id}
      sessionEndpoint={`/api/tasks/${task.id}/session`}
      openTerminalEndpoint={`/api/tasks/${task.id}/session`}
      openFolderEndpoint={`/api/tasks/${task.id}/terminal`}
      sessionVersion={task.phase}
    />
  );
}
