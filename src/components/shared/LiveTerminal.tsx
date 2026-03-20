'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  TerminalMode,
  TerminalServerMessage,
  TerminalSessionInfo,
  TerminalSessionResponse,
  TerminalTargetKind,
} from '@/lib/terminal/types';
import {
  CLOSE_CONTROL_CONFLICT,
  CONTROL_CONFLICT_MESSAGE,
} from '@/lib/terminal/types';

type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

interface LiveTerminalProps {
  targetKind: TerminalTargetKind;
  targetId: string;
  sessionEndpoint: string;
  openTerminalEndpoint: string;
  openFolderEndpoint?: string;
  sessionVersion?: string;
  isMaximized?: boolean;
  maximizeSupported?: boolean;
  onMaximizeToggle?: () => void;
}

const DEFAULT_WS_PATH = '/ws/terminal';
const DEFAULT_MODE: TerminalMode = 'observe';
const RETRY_DELAY_MS = 1500;
type ModeFallbackReason = 'control_conflict' | null;

function isControlConflict(
  closeCode?: number,
  message?: string | null,
): boolean {
  return (
    closeCode === CLOSE_CONTROL_CONFLICT
    || message?.includes(CONTROL_CONFLICT_MESSAGE) === true
  );
}

export function LiveTerminal({
  targetKind,
  targetId,
  sessionEndpoint,
  openTerminalEndpoint,
  openFolderEndpoint,
  sessionVersion,
  isMaximized = false,
  maximizeSupported = false,
  onMaximizeToggle,
}: LiveTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const resizeHandlerRef = useRef<(() => void) | null>(null);
  const modeSeedKeyRef = useRef<string | null>(null);
  const socketErrorRef = useRef<string | null>(null);

  const [terminalReady, setTerminalReady] = useState(false);
  const [session, setSession] = useState<TerminalSessionInfo | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [preferredMode, setPreferredMode] = useState<TerminalMode>(DEFAULT_MODE);
  const [effectiveMode, setEffectiveMode] = useState<TerminalMode>('observe');
  const [modeFallbackReason, setModeFallbackReason] =
    useState<ModeFallbackReason>(null);
  const [wsPath, setWsPath] = useState(DEFAULT_WS_PATH);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [openingTerminal, setOpeningTerminal] = useState(false);
  const [openingFolder, setOpeningFolder] = useState(false);
  const requestedMode =
    modeFallbackReason === 'control_conflict' ? 'observe' : preferredMode;

  const writeNotice = useCallback((message: string, color: '31' | '32' | '33') => {
    terminalRef.current?.writeln(`\r\n\x1b[${color}m${message}\x1b[0m`);
  }, []);

  const focusTerminal = useCallback(() => {
    requestAnimationFrame(() => {
      terminalRef.current?.focus();
    });
  }, []);

  const syncTerminalSize = useCallback(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;

    if (!terminal || !fitAddon) {
      return { cols: 80, rows: 24 };
    }

    try {
      fitAddon.fit();
    } catch {
      // The terminal can briefly be hidden during layout changes.
    }

    const cols = Math.max(terminal.cols ?? 80, 2);
    const rows = Math.max(terminal.rows ?? 24, 2);

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
    }

    return { cols, rows };
  }, []);

  const closeSocket = useCallback(() => {
    const existingSocket = socketRef.current;
    socketRef.current = null;

    if (existingSocket) {
      existingSocket.close();
    }
  }, []);

  const fetchSession = useCallback(async (retries = 0) => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    setSessionLoading(true);

    try {
      const response = await fetch(sessionEndpoint);
      const data = await response.json() as TerminalSessionResponse;

      if (!response.ok) {
        throw new Error(
          (data as { error?: string }).error ?? 'Failed to load session metadata.',
        );
      }

      setSession(data.session ?? null);
      setWsPath(data.terminal?.ws_path ?? DEFAULT_WS_PATH);
      setConnectionError(null);

      const nextModeSeedKey = [
        targetKind,
        targetId,
        sessionVersion ?? 'session',
        data.session?.tmux_session ?? 'none',
      ].join(':');

      if (modeSeedKeyRef.current !== nextModeSeedKey) {
        modeSeedKeyRef.current = nextModeSeedKey;
        setPreferredMode(data.terminal?.default_mode ?? DEFAULT_MODE);
        setEffectiveMode('observe');
        setModeFallbackReason(null);
      }

      if (!data.session && retries < 3) {
        retryTimerRef.current = setTimeout(() => {
          void fetchSession(retries + 1);
        }, RETRY_DELAY_MS);
        return;
      }
    } catch (error: any) {
      setSession(null);
      setConnectionError(error.message ?? 'Failed to load session metadata.');
    } finally {
      setSessionLoading(false);
    }
  }, [sessionEndpoint, sessionVersion, targetId, targetKind]);

  const handleReconnect = useCallback(async () => {
    closeSocket();
    setEffectiveMode('observe');
    setConnectionState('idle');
    setConnectionError(null);
    await fetchSession();
  }, [closeSocket, fetchSession]);

  const handleRetryControl = useCallback(async () => {
    setPreferredMode('control');
    setModeFallbackReason(null);
    await handleReconnect();
  }, [handleReconnect]);

  const handleOpenInTerminal = useCallback(async () => {
    setOpeningTerminal(true);
    try {
      const response = await fetch(openTerminalEndpoint, { method: 'POST' });
      const data = await response.json();

      if (!response.ok) {
        const command =
          data.manual_command ?? 'tmux attach-session -t <session>';
        writeNotice(`Failed to open terminal: ${data.error}`, '31');
        writeNotice(`Manual command: ${command}`, '33');
      }
    } catch {
      writeNotice('Failed to open terminal.', '31');
    } finally {
      setOpeningTerminal(false);
    }
  }, [openTerminalEndpoint, writeNotice]);

  const handleOpenFolder = useCallback(async () => {
    if (!openFolderEndpoint) {
      return;
    }

    setOpeningFolder(true);
    try {
      const response = await fetch(openFolderEndpoint, { method: 'POST' });
      const data = await response.json();

      if (!response.ok) {
        writeNotice(`Failed to open folder: ${data.error}`, '31');
        if (data.clone_path) {
          writeNotice(`Clone path: ${data.clone_path}`, '33');
        }
      } else if (data.clone_path) {
        writeNotice(`Opened folder: ${data.clone_path}`, '32');
      }
    } catch {
      writeNotice('Failed to open folder.', '31');
    } finally {
      setOpeningFolder(false);
    }
  }, [openFolderEndpoint, writeNotice]);

  useEffect(() => {
    void fetchSession();

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [fetchSession, sessionVersion]);

  useEffect(() => {
    let disposed = false;

    async function initTerminal() {
      if (!containerRef.current) {
        return;
      }

      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('xterm'),
        import('xterm-addon-fit'),
      ]);

      if (disposed || !containerRef.current) {
        return;
      }

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
        disableStdin: true,
        scrollback: 5000,
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current);
      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      terminal.onData((data: string) => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ type: 'input', data }));
        }
      });

      // Debounce resize events using requestAnimationFrame
      const debouncedResize = () => {
        if (resizeFrameRef.current) {
          cancelAnimationFrame(resizeFrameRef.current);
        }
        resizeFrameRef.current = requestAnimationFrame(() => {
          syncTerminalSize();
          resizeFrameRef.current = null;
        });
      };

      // Store the handler so we can remove it in cleanup
      resizeHandlerRef.current = debouncedResize;

      resizeObserverRef.current = new ResizeObserver(debouncedResize);
      resizeObserverRef.current.observe(containerRef.current);
      window.addEventListener('resize', debouncedResize);

      requestAnimationFrame(() => {
        if (!disposed) {
          syncTerminalSize();
          setTerminalReady(true);
        }
      });
    }

    initTerminal();

    return () => {
      disposed = true;
      closeSocket();

      // Cancel any pending resize animation frame
      if (resizeFrameRef.current) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }

      // Remove window resize listener
      if (resizeHandlerRef.current) {
        window.removeEventListener('resize', resizeHandlerRef.current);
        resizeHandlerRef.current = null;
      }

      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;

      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }

      fitAddonRef.current = null;
      setTerminalReady(false);
    };
  }, [closeSocket, syncTerminalSize]);

  useEffect(() => {
    if (!terminalRef.current) {
      return;
    }

    terminalRef.current.options.disableStdin = effectiveMode !== 'control';
  }, [effectiveMode]);

  useEffect(() => {
    if (
      terminalReady
      && connectionState === 'connected'
      && effectiveMode === 'control'
    ) {
      focusTerminal();
    }
  }, [connectionState, effectiveMode, focusTerminal, terminalReady]);

  useEffect(() => {
    if (!terminalReady || !session || session.status !== 'running') {
      closeSocket();
      setEffectiveMode('observe');
      setConnectionState(session ? 'disconnected' : 'idle');
      return;
    }

    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    const { cols, rows } = syncTerminalSize();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = new URL(wsPath, `${protocol}//${window.location.host}`);
    wsUrl.searchParams.set('target', targetKind);
    wsUrl.searchParams.set('id', targetId);
    wsUrl.searchParams.set('mode', requestedMode);
    wsUrl.searchParams.set('cols', String(cols));
    wsUrl.searchParams.set('rows', String(rows));

    closeSocket();
    socketErrorRef.current = null;

    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;
    setEffectiveMode('observe');
    setConnectionState('connecting');
    setConnectionError(null);

    socket.onopen = () => {
      if (socketRef.current !== socket) {
        return;
      }

      syncTerminalSize();
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      if (socketRef.current !== socket) {
        return;
      }

      let message: TerminalServerMessage;
      try {
        message = JSON.parse(event.data) as TerminalServerMessage;
      } catch {
        return;
      }

      switch (message.type) {
        case 'ready':
          setConnectionState('connected');
          setConnectionError(null);
          setEffectiveMode(message.mode);
          if (message.mode === 'control') {
            setModeFallbackReason(null);
            focusTerminal();
          }
          return;

        case 'output':
          terminal.write(message.data);
          return;

        case 'error':
          socketErrorRef.current = message.message;
          if (requestedMode === 'control' && isControlConflict(undefined, message.message)) {
            return;
          }
          setConnectionState('error');
          setConnectionError(message.message);
          setEffectiveMode('observe');
          return;

        case 'exit':
          setConnectionState('disconnected');
          setEffectiveMode('observe');
          return;

        case 'mode':
          setEffectiveMode(message.mode);
          if (message.mode === 'control') {
            setModeFallbackReason(null);
            focusTerminal();
          }
          return;
      }
    };

    socket.onerror = () => {
      if (socketRef.current === socket) {
        setConnectionState('error');
        setConnectionError('Terminal connection failed.');
        setEffectiveMode('observe');
      }
    };

    socket.onclose = (event) => {
      if (socketRef.current !== socket) {
        return;
      }

      socketRef.current = null;
      if (
        requestedMode === 'control'
        && isControlConflict(event.code, socketErrorRef.current ?? event.reason)
      ) {
        setModeFallbackReason('control_conflict');
        setConnectionState('disconnected');
        setConnectionError(null);
        setEffectiveMode('observe');
        return;
      }

      setEffectiveMode('observe');
      setConnectionState((currentState) =>
        currentState === 'error' ? currentState : 'disconnected',
      );
    };

    return () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }

      socket.close();
    };
  }, [
    closeSocket,
    focusTerminal,
    requestedMode,
    session,
    syncTerminalSize,
    targetId,
    targetKind,
    terminalReady,
    wsPath,
  ]);

  const runningSession = session?.status === 'running' ? session : null;
  const connectionLabel =
    connectionState === 'connected'
      ? 'Connected'
      : connectionState === 'connecting'
        ? 'Connecting'
        : connectionState === 'error'
          ? 'Error'
          : 'Disconnected';
  const connectionColor =
    connectionState === 'connected'
      ? 'bg-green-500'
      : connectionState === 'connecting'
        ? 'bg-amber-500'
        : connectionState === 'error'
          ? 'bg-red-500'
          : 'bg-zinc-500';

  return (
    <div className="flex h-full flex-col" data-live-terminal>
      <div className="m-4 flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-[#0c0c14]">
        <div className="flex items-center gap-2 border-b border-border/50 bg-[#111120] px-3 py-2">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
          </div>

          <span className="ml-2 text-[10px] font-mono text-text-secondary/50">
            {targetId}
            {session
              ? ` - ${session.agent_name} (${session.phase})`
              : ' - terminal'}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${connectionColor}`} />
              <span className="text-[10px] text-text-secondary/50">
                {connectionLabel}
              </span>
            </div>

            <div className="text-[10px] text-text-secondary/50">
              {effectiveMode === 'control' ? 'Control' : 'Observe'}
            </div>

            {maximizeSupported && onMaximizeToggle ? (
              <button
                onClick={onMaximizeToggle}
                className="rounded border border-border/30 px-2 py-0.5 text-[10px] text-text-secondary/70 transition-colors hover:border-border/60 hover:text-text-primary"
              >
                {isMaximized ? 'Restore' : 'Maximize'}
              </button>
            ) : null}

            <button
              onClick={() => {
                void handleReconnect();
              }}
              disabled={sessionLoading}
              className="rounded border border-border/30 px-2 py-0.5 text-[10px] text-text-secondary/70 transition-colors hover:border-border/60 hover:text-text-primary disabled:opacity-50"
            >
              {sessionLoading ? 'Loading...' : 'Reconnect'}
            </button>

            <button
              onClick={() => {
                setConnectionError(null);
                setModeFallbackReason(null);
                // Toggle relative to what the user sees, not the hidden preferredMode
                const nextMode = effectiveMode === 'control' ? 'observe' : 'control';
                setPreferredMode(nextMode);
              }}
              disabled={!runningSession}
              className="rounded border border-border/30 px-2 py-0.5 text-[10px] text-text-secondary/70 transition-colors hover:border-border/60 hover:text-text-primary disabled:opacity-50"
            >
              {effectiveMode === 'control' ? 'Disable Input' : 'Enable Input'}
            </button>

            <button
              onClick={() => {
                void handleOpenInTerminal();
              }}
              disabled={!runningSession || openingTerminal}
              className="rounded border border-border/30 px-2 py-0.5 text-[10px] text-text-secondary/70 transition-colors hover:border-border/60 hover:text-text-primary disabled:opacity-50"
            >
              {openingTerminal ? 'Opening...' : 'Open in Terminal'}
            </button>

            {openFolderEndpoint ? (
              <button
                onClick={() => {
                  void handleOpenFolder();
                }}
                disabled={openingFolder}
                className="rounded border border-border/30 px-2 py-0.5 text-[10px] text-text-secondary/70 transition-colors hover:border-border/60 hover:text-text-primary disabled:opacity-50"
              >
                {openingFolder ? 'Opening...' : 'Open Folder'}
              </button>
            ) : null}
          </div>
        </div>

        {modeFallbackReason === 'control_conflict' && runningSession ? (
          <div className="flex items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
            <span>
              Viewing only. Another browser currently has control of this terminal.
            </span>
            <button
              onClick={() => {
                void handleRetryControl();
              }}
              className="rounded border border-amber-300/30 px-2 py-0.5 text-[10px] font-medium text-amber-100 transition-colors hover:border-amber-200/60"
            >
              Retry Control
            </button>
          </div>
        ) : null}

        {effectiveMode === 'control' && runningSession ? (
          <div className="border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
            Input is going to the live tmux session shared with the running agent.
          </div>
        ) : null}

        <div className="relative min-h-0 flex-1">
          <div
            className="h-full w-full"
            onMouseDownCapture={() => {
              if (effectiveMode === 'control') {
                focusTerminal();
              }
            }}
          >
            <div ref={containerRef} className="h-full w-full" />
          </div>

          {!runningSession || sessionLoading || connectionError ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0c0c14]/82 px-6 text-center">
              <div className="max-w-sm space-y-2">
                <p className="text-sm font-medium text-text-primary">
                  {sessionLoading
                    ? 'Looking for an active tmux session...'
                    : connectionError
                      ? connectionError
                      : session
                        ? 'The latest tmux session is no longer running.'
                        : 'No active tmux session for this item.'}
                </p>
                <p className="text-xs text-text-secondary/70">
                  {sessionLoading
                    ? 'The terminal will connect as soon as the session appears.'
                    : 'Use Reconnect to try again after a new session starts.'}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
