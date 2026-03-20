'use client';

import type { Task } from '@/types';
import { LiveTerminal } from '@/components/shared/LiveTerminal';

interface TerminalTabProps {
  task: Task;
  isMaximized: boolean;
  maximizeSupported: boolean;
  onMaximizeToggle: () => void;
}

export function TerminalTab({
  task,
  isMaximized,
  maximizeSupported,
  onMaximizeToggle,
}: TerminalTabProps) {
  return (
    <LiveTerminal
      targetKind="task"
      targetId={task.id}
      sessionEndpoint={`/api/tasks/${task.id}/session`}
      openTerminalEndpoint={`/api/tasks/${task.id}/session`}
      openFolderEndpoint={`/api/tasks/${task.id}/terminal`}
      sessionVersion={task.phase}
      isMaximized={isMaximized}
      maximizeSupported={maximizeSupported}
      onMaximizeToggle={onMaximizeToggle}
    />
  );
}
