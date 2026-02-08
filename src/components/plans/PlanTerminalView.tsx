'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Plan } from '@/types';
import { useWebSocket } from '@/hooks/useWebSocket';

interface PlanTerminalViewProps {
  plan: Plan;
}

interface SessionInfo {
  tmux_session: string;
  agent_name: string;
  phase: string;
  status: string;
}

export function PlanTerminalView({ plan }: PlanTerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [openingTerminal, setOpeningTerminal] = useState(false);

  const { lastMessage, isConnected } = useWebSocket(plan.id);

  const fetchSession = useCallback(async (retries = 0) => {
    setSessionLoading(true);
    try {
      const res = await fetch(`/api/plans/${plan.id}/session`);
      const data = await res.json();
      const sess = data.session ?? null;
      setSession(sess);

      if (!sess && retries < 3) {
        setTimeout(() => fetchSession(retries + 1), 1500);
        return;
      }

      if (sess) {
        try {
          const streamRes = await fetch(`/api/plans/${plan.id}/session`, {
            method: 'PATCH',
          });
          const streamData = await streamRes.json();
          if (streamData.buffer && terminalRef.current) {
            terminalRef.current.clear();
            terminalRef.current.write(streamData.buffer);
          }
        } catch {
          // Streaming start failed
        }
      }
    } catch {
      setSession(null);
    } finally {
      setSessionLoading(false);
    }
  }, [plan.id]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession, plan.phase]);

  // Initialize xterm.js
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

      requestAnimationFrame(() => {
        if (!disposed) {
          try { fitAddon.fit(); } catch { /* Container might not be visible */ }
        }
      });

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      terminal.writeln('\x1b[90m--- Plan agent session for ' + plan.id + ' ---\x1b[0m');
      terminal.writeln('');
    }

    initTerminal();

    const handleResize = () => {
      if (fitAddonRef.current) {
        try { fitAddonRef.current.fit(); } catch { /* ignore */ }
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
  }, [plan.id]);

  // Write incoming WebSocket messages
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

  const handleOpenInTerminal = async () => {
    setOpeningTerminal(true);
    try {
      const res = await fetch(`/api/plans/${plan.id}/session`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        const cmd = data.manual_command ?? 'tmux attach-session -t <session>';
        terminalRef.current?.writeln(
          `\r\n\x1b[31mFailed to open terminal: ${data.error}\x1b[0m`,
        );
        terminalRef.current?.writeln(`\x1b[33mManual command: ${cmd}\x1b[0m`);
      }
    } catch {
      terminalRef.current?.writeln('\r\n\x1b[31mFailed to open terminal\x1b[0m');
    } finally {
      setOpeningTerminal(false);
    }
  };

  const statusColor = isConnected ? 'bg-green-500' : 'bg-red-500';
  const statusText = isConnected ? 'Connected' : 'Disconnected';

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 rounded-lg m-4 bg-[#0c0c14] border border-border overflow-hidden flex flex-col">
        {/* Terminal header */}
        <div className="flex items-center gap-2 border-b border-border/50 bg-[#111120] px-3 py-2">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
          </div>
          <span className="text-[10px] font-mono text-text-secondary/50 ml-2">
            {plan.id}
            {session ? ` - ${session.agent_name} (${session.phase})` : ' - terminal'}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${statusColor}`} />
              <span className="text-[10px] text-text-secondary/50">{statusText}</span>
            </div>

            <button
              onClick={() => fetchSession()}
              disabled={sessionLoading}
              className="text-[10px] text-text-secondary/70 hover:text-text-primary px-2 py-0.5 rounded border border-border/30 hover:border-border/60 transition-colors disabled:opacity-50"
            >
              {sessionLoading ? 'Loading...' : 'Refresh'}
            </button>

            <button
              onClick={handleOpenInTerminal}
              disabled={!session || openingTerminal}
              className="text-[10px] text-text-secondary/70 hover:text-text-primary px-2 py-0.5 rounded border border-border/30 hover:border-border/60 transition-colors disabled:opacity-50"
            >
              {openingTerminal ? 'Opening...' : 'Open in Terminal'}
            </button>
          </div>
        </div>

        {/* Terminal body */}
        <div ref={containerRef} className="flex-1 min-h-0" />
      </div>
    </div>
  );
}
