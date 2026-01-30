'use client';

import { useState } from 'react';
import useSWR from 'swr';
import type { Task } from '@/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface DevServerPanelProps {
  task: Task;
}

interface ServerStatus {
  running: boolean;
  session: string | null;
  url: string | null;
  port: number | null;
}

export function DevServerPanel({ task }: DevServerPanelProps) {
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCommandInput, setShowCommandInput] = useState(false);
  const [command, setCommand] = useState('npm run dev');

  const { data, mutate } = useSWR<ServerStatus>(
    `/api/tasks/${task.id}/server`,
    fetcher,
    { refreshInterval: 5000 },
  );

  const handleStart = async (cmd?: string) => {
    setIsStarting(true);
    setError(null);
    setShowCommandInput(false);
    try {
      const res = await fetch(`/api/tasks/${task.id}/server`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd || command }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || 'Failed to start server');
      } else {
        mutate();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start server');
    } finally {
      setIsStarting(false);
    }
  };

  const handleOpenTerminal = async () => {
    if (!data?.session) return;
    try {
      await fetch(`/api/tasks/${task.id}/server/terminal`, {
        method: 'POST',
      });
    } catch (err) {
      console.error('Failed to open terminal:', err);
    }
  };

  const handleStop = async () => {
    setIsStopping(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}/server`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const result = await res.json();
        setError(result.error || 'Failed to stop server');
      } else {
        mutate();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to stop server');
    } finally {
      setIsStopping(false);
    }
  };

  const isRunning = data?.running ?? false;

  return (
    <div className="flex flex-col gap-2 px-4 py-2 border-t border-border bg-bg-primary/50">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {isRunning && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                isRunning ? 'bg-green-400' : 'bg-gray-500'
              }`}
            />
          </span>
          <span className="text-xs font-medium text-text-secondary">
            Dev Server
          </span>
        </div>

        {isRunning ? (
          <>
            <a
              href={data?.url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-accent hover:text-accent/80 bg-accent/10 rounded transition-colors"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              {data?.url}
            </a>
            <button
              onClick={handleOpenTerminal}
              className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-text-secondary hover:text-text-primary bg-bg-hover rounded transition-colors"
              title={`tmux attach -t ${data?.session}`}
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
              </svg>
              Terminal
            </button>
            <button
              onClick={handleStop}
              disabled={isStopping}
              className="px-2 py-1 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded transition-colors disabled:opacity-50"
            >
              {isStopping ? 'Stopping...' : 'Stop'}
            </button>
          </>
        ) : showCommandInput ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="npm run dev"
              className="flex-1 px-2 py-1 text-xs bg-bg-primary border border-border rounded text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleStart();
                if (e.key === 'Escape') setShowCommandInput(false);
              }}
              autoFocus
            />
            <button
              onClick={() => handleStart()}
              disabled={isStarting}
              className="px-2 py-1 text-xs font-medium text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/20 rounded transition-colors disabled:opacity-50"
            >
              {isStarting ? 'Starting...' : 'Start'}
            </button>
            <button
              onClick={() => setShowCommandInput(false)}
              className="px-2 py-1 text-xs font-medium text-text-secondary hover:text-text-primary rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowCommandInput(true)}
            className="px-2 py-1 text-xs font-medium text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/20 rounded transition-colors"
          >
            Start Server
          </button>
        )}

        {error && (
          <span className="text-xs text-red-400">{error}</span>
        )}
      </div>
    </div>
  );
}
