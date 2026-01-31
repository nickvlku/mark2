'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Task } from '@/types';
import { useWebSocket } from '@/hooks/useWebSocket';

interface TerminalTabProps {
  task: Task;
}

interface SessionInfo {
  tmux_session: string;
  agent_name: string;
  phase: string;
  status: string;
}

export function TerminalTab({ task }: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [openingTerminal, setOpeningTerminal] = useState(false);
  const [openingFolder, setOpeningFolder] = useState(false);

  const { lastMessage, isConnected } = useWebSocket(task.id);

  // ── Fetch session info and start streaming ──────────────────────────────
  const fetchSession = useCallback(async (retries = 0) => {
    setSessionLoading(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/session`);
      const data = await res.json();
      const sess = data.session ?? null;
      setSession(sess);

      // On phase change the new session may not be spawned yet — retry briefly
      if (!sess && retries < 3) {
        setTimeout(() => fetchSession(retries + 1), 1500);
        return; // keep loading state
      }

      // If we have a session, start streaming and get the buffer
      if (sess) {
        try {
          const streamRes = await fetch(`/api/tasks/${task.id}/session`, {
            method: 'PATCH',
          });
          const streamData = await streamRes.json();
          if (streamData.buffer && terminalRef.current) {
            // Clear terminal and write the captured buffer
            terminalRef.current.clear();
            terminalRef.current.write(streamData.buffer);
          }
        } catch {
          // Streaming start failed, but session info is still valid
        }
      }
    } catch {
      setSession(null);
    } finally {
      setSessionLoading(false);
    }
  }, [task.id]);

  // Re-fetch session when task id or phase changes
  useEffect(() => {
    fetchSession();
  }, [fetchSession, task.phase]);

  // ── Initialize xterm.js (dynamic import for client-only) ──────────────
  useEffect(() => {
    let disposed = false;

    async function initTerminal() {
      if (!containerRef.current) return;

      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('xterm'),
        import('xterm-addon-fit'),
      ]);

      if (disposed || !containerRef.current) return;

      const fitAddon = new FitAddon();
      const terminal = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        theme: {
          background: '#0c0c14',
          foreground: '#c0c0d0',
          cursor: '#7c7cff',
          selectionBackground: '#3a3a5c',
        },
        convertEol: true,
        scrollback: 5000,
      });

      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current);

      // Small delay to ensure the container has layout dimensions
      requestAnimationFrame(() => {
        if (!disposed) {
          try {
            fitAddon.fit();
          } catch {
            // Container might not be visible yet
          }
        }
      });

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      terminal.writeln('\x1b[90m--- Terminal session for ' + task.id + ' ---\x1b[0m');
      terminal.writeln('');
    }

    initTerminal();

    // Handle window resize
    const handleResize = () => {
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
      fitAddonRef.current = null;
    };
  }, [task.id]);

  // ── Write incoming terminal:output messages to xterm ───────────────────
  useEffect(() => {
    if (
      lastMessage &&
      lastMessage.event === 'terminal:output' &&
      lastMessage.payload?.data &&
      terminalRef.current
    ) {
      terminalRef.current.write(lastMessage.payload.data as string);
    }
  }, [lastMessage]);

  // ── Open in native terminal ───────────────────────────────────────────
  const handleOpenInTerminal = async () => {
    setOpeningTerminal(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/session`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        const cmd = data.manual_command ?? `tmux attach-session -t <session>`;
        terminalRef.current?.writeln(
          `\r\n\x1b[31mFailed to open terminal: ${data.error}\x1b[0m`,
        );
        terminalRef.current?.writeln(
          `\x1b[33mManual command: ${cmd}\x1b[0m`,
        );
      }
    } catch {
      terminalRef.current?.writeln(
        '\r\n\x1b[31mFailed to open terminal\x1b[0m',
      );
    } finally {
      setOpeningTerminal(false);
    }
  };

  // ── Open folder in native terminal ──────────────────────────────────────
  const handleOpenFolder = async () => {
    setOpeningFolder(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/terminal`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        terminalRef.current?.writeln(
          `\r\n\x1b[31mFailed to open folder: ${data.error}\x1b[0m`,
        );
        if (data.clone_path) {
          terminalRef.current?.writeln(
            `\x1b[33mClone path: ${data.clone_path}\x1b[0m`,
          );
        }
      } else {
        terminalRef.current?.writeln(
          `\r\n\x1b[32mOpened folder: ${data.clone_path}\x1b[0m`,
        );
      }
    } catch {
      terminalRef.current?.writeln(
        '\r\n\x1b[31mFailed to open folder\x1b[0m',
      );
    } finally {
      setOpeningFolder(false);
    }
  };

  // ── Connection status indicator ───────────────────────────────────────
  const statusColor = isConnected ? 'bg-green-500' : 'bg-red-500';
  const statusText = isConnected ? 'Connected' : 'Disconnected';

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 rounded-lg m-4 bg-[#0c0c14] border border-border overflow-hidden flex flex-col">
        {/* Terminal header bar */}
        <div className="flex items-center gap-2 border-b border-border/50 bg-[#111120] px-3 py-2">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
          </div>
          <span className="text-[10px] font-mono text-text-secondary/50 ml-2">
            {task.id}
            {session ? ` - ${session.agent_name} (${session.phase})` : ' - terminal'}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {/* Connection status */}
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${statusColor}`} />
              <span className="text-[10px] text-text-secondary/50">
                {statusText}
              </span>
            </div>

            {/* Refresh button */}
            <button
              onClick={() => fetchSession()}
              disabled={sessionLoading}
              className="text-[10px] text-text-secondary/70 hover:text-text-primary px-2 py-0.5 rounded border border-border/30 hover:border-border/60 transition-colors disabled:opacity-50"
            >
              {sessionLoading ? 'Loading...' : 'Refresh'}
            </button>

            {/* Open in terminal button */}
            <button
              onClick={handleOpenInTerminal}
              disabled={!session || openingTerminal}
              className="text-[10px] text-text-secondary/70 hover:text-text-primary px-2 py-0.5 rounded border border-border/30 hover:border-border/60 transition-colors disabled:opacity-50"
            >
              {openingTerminal ? 'Opening...' : 'Open in Terminal'}
            </button>

            {/* Open folder button */}
            <button
              onClick={handleOpenFolder}
              disabled={openingFolder}
              className="text-[10px] text-text-secondary/70 hover:text-text-primary px-2 py-0.5 rounded border border-border/30 hover:border-border/60 transition-colors disabled:opacity-50"
              title="Open working directory in a new terminal"
            >
              {openingFolder ? 'Opening...' : 'Open Folder'}
            </button>
          </div>
        </div>

        {/* Terminal body — xterm.js mounts here */}
        <div ref={containerRef} className="flex-1 min-h-0" />
      </div>
    </div>
  );
}
