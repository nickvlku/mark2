'use client';

import type { Task } from '@/types';

interface TerminalTabProps {
  task: Task;
}

export function TerminalTab({ task }: TerminalTabProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 rounded-lg m-4 bg-[#0c0c14] border border-border overflow-hidden">
        {/* Terminal header bar */}
        <div className="flex items-center gap-2 border-b border-border/50 bg-[#111120] px-3 py-2">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
          </div>
          <span className="text-[10px] font-mono text-text-secondary/50 ml-2">
            {task.id} - terminal
          </span>
        </div>

        {/* Terminal body */}
        <div className="p-4 font-mono text-sm">
          <div className="text-green-400">
            $ mark2 agent terminal --task {task.id}
          </div>
          <div className="mt-2 text-text-secondary/70">
            Terminal session will be connected via WebSocket.
          </div>
          <div className="mt-1 text-text-secondary/50 text-xs">
            Waiting for agent process to start...
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="text-green-400">$</span>
            <span className="inline-block h-4 w-2 bg-green-400/70 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
