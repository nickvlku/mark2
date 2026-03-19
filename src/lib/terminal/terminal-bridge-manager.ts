import { randomUUID } from 'crypto';
import fs from 'fs';
import type { IncomingMessage } from 'http';
import path from 'path';
import * as pty from 'node-pty';
import type { IPty } from 'node-pty';
import { WebSocket } from 'ws';
import {
  isTerminalTargetKind,
  isValidTerminalTarget,
  resolveActiveTerminalSession,
  terminalTargetKey,
} from './terminal-target-resolver';
import type {
  TerminalBridge,
  TerminalClientMessage,
  TerminalServerMessage,
  TerminalTarget,
} from './types';

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;
const MAX_COLS = 400;
const MAX_ROWS = 200;
const MAX_INPUT_LENGTH = 65536; // 64KB max per input message
const CLOSE_POLICY_VIOLATION = 1008;
const CLOSE_TRY_AGAIN_LATER = 1013;
const CLOSE_CONFLICT = 4409;
const TMUX_FALLBACK_PATHS = [
  '/opt/homebrew/bin/tmux',
  '/usr/local/bin/tmux',
  '/usr/bin/tmux',
  '/bin/tmux',
];

interface TerminalBridgeState extends TerminalBridge {
  ptyProcess: IPty;
  ws: WebSocket;
}

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveTmuxCommand(): string {
  const override = process.env.MARK2_TMUX_PATH?.trim();
  if (override) {
    return override;
  }

  const pathCandidates = (process.env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean)
    .map((dir) => path.join(dir, 'tmux'));

  for (const candidate of [...pathCandidates, ...TMUX_FALLBACK_PATHS]) {
    if (isExecutable(candidate)) {
      return candidate;
    }
  }

  return 'tmux';
}

export class TerminalBridgeManager {
  private bridges = new Map<string, TerminalBridgeState>();
  private controlLocks = new Map<string, string>();

  async handleConnection(ws: WebSocket, request: IncomingMessage): Promise<void> {
    // Set up keepalive tracking
    (ws as any).isAlive = true;
    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });

    const requestUrl = new URL(request.url ?? '/', 'http://localhost');
    const kind = requestUrl.searchParams.get('target');
    const id = requestUrl.searchParams.get('id');
    const mode = requestUrl.searchParams.get('mode') === 'control'
      ? 'control'
      : 'observe';

    if (!isTerminalTargetKind(kind) || !id) {
      this.failConnection(ws, 'Invalid terminal target.', CLOSE_POLICY_VIOLATION);
      return;
    }

    const target: TerminalTarget = { kind, id };
    if (!isValidTerminalTarget(target)) {
      this.failConnection(ws, 'Invalid terminal target.', CLOSE_POLICY_VIOLATION);
      return;
    }

    const session = await resolveActiveTerminalSession(target);
    if (!session) {
      this.failConnection(ws, 'No active tmux session.', CLOSE_POLICY_VIOLATION);
      return;
    }

    const targetKey = terminalTargetKey(target);
    const connectionId = randomUUID();

    if (mode === 'control') {
      const existingLock = this.controlLocks.get(targetKey);
      if (existingLock) {
        this.failConnection(
          ws,
          'Another browser already has control of this terminal.',
          CLOSE_CONFLICT,
        );
        return;
      }

      this.controlLocks.set(targetKey, connectionId);
    }

    const cols = this.parseDimension(
      requestUrl.searchParams.get('cols'),
      DEFAULT_COLS,
      MAX_COLS,
    );
    const rows = this.parseDimension(
      requestUrl.searchParams.get('rows'),
      DEFAULT_ROWS,
      MAX_ROWS,
    );
    const tmuxCommand = resolveTmuxCommand();

    let ptyProcess: IPty;
    try {
      // Build minimal environment with only necessary variables
      // to prevent leaking server secrets (API keys, DB URLs, etc.)
      const env: Record<string, string> = {
        TERM: process.env.TERM || 'xterm-256color',
        COLORTERM: process.env.COLORTERM || 'truecolor',
      };

      // Include essential system variables if present
      const safeVars = ['PATH', 'HOME', 'SHELL', 'USER', 'LANG', 'LC_ALL', 'TMPDIR'];
      for (const key of safeVars) {
        if (process.env[key]) {
          env[key] = process.env[key]!;
        }
      }

      ptyProcess = pty.spawn(
        tmuxCommand,
        mode === 'control'
          ? ['attach-session', '-t', session.tmux_session]
          : ['attach-session', '-f', 'read-only', '-t', session.tmux_session],
        {
          name: 'xterm-256color',
          cols,
          rows,
          cwd: process.cwd(),
          env,
        },
      );
    } catch (error: any) {
      if (mode === 'control') {
        this.controlLocks.delete(targetKey);
      }

      this.failConnection(
        ws,
        error.message ?? 'Failed to start tmux bridge.',
        CLOSE_TRY_AGAIN_LATER,
      );
      return;
    }

    const bridge: TerminalBridgeState = {
      connectionId,
      target,
      tmuxSession: session.tmux_session,
      mode,
      cols,
      rows,
      connectedAt: new Date().toISOString(),
      ptyProcess,
      ws,
    };

    this.bridges.set(connectionId, bridge);

    ptyProcess.onData((data) => {
      this.sendMessage(ws, {
        type: 'output',
        data,
      });
    });

    ptyProcess.onExit(({ exitCode }) => {
      this.sendMessage(ws, {
        type: 'exit',
        code: exitCode ?? 0,
      });
      this.cleanup(connectionId, false);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    ws.on('message', (rawMessage) => {
      this.handleClientMessage(connectionId, rawMessage.toString());
    });

    ws.on('close', () => {
      this.cleanup(connectionId, true);
    });

    ws.on('error', () => {
      this.cleanup(connectionId, true);
    });

    this.sendMessage(ws, {
      type: 'ready',
      session: session.tmux_session,
      mode,
    });
  }

  disposeAll(): void {
    for (const connectionId of [...this.bridges.keys()]) {
      this.cleanup(connectionId, true);
    }
  }

  private handleClientMessage(connectionId: string, rawMessage: string): void {
    const bridge = this.bridges.get(connectionId);
    if (!bridge) {
      return;
    }

    let message: TerminalClientMessage;
    try {
      message = JSON.parse(rawMessage) as TerminalClientMessage;
    } catch {
      return;
    }

    switch (message.type) {
      case 'resize': {
        const cols = this.parseDimension(message.cols, bridge.cols, MAX_COLS);
        const rows = this.parseDimension(message.rows, bridge.rows, MAX_ROWS);
        bridge.cols = cols;
        bridge.rows = rows;
        bridge.ptyProcess.resize(cols, rows);
        return;
      }

      case 'input': {
        if (bridge.mode === 'control' && message.data) {
          // Validate input length to prevent abuse
          if (message.data.length > MAX_INPUT_LENGTH) {
            return;
          }
          bridge.ptyProcess.write(message.data);
        }
        return;
      }

      case 'ping':
        return;
    }
  }

  private cleanup(connectionId: string, killPty: boolean): void {
    const bridge = this.bridges.get(connectionId);
    if (!bridge) {
      return;
    }

    this.bridges.delete(connectionId);

    if (bridge.mode === 'control') {
      const targetKey = terminalTargetKey(bridge.target);
      if (this.controlLocks.get(targetKey) === connectionId) {
        this.controlLocks.delete(targetKey);
      }
    }

    if (killPty) {
      try {
        bridge.ptyProcess.kill();
      } catch {
        // Ignore cleanup errors.
      }
    }
  }

  private parseDimension(
    value: number | string | null | undefined,
    fallback: number,
    max: number,
  ): number {
    const parsed =
      typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);

    if (!Number.isFinite(parsed) || parsed < 2) {
      return fallback;
    }

    return Math.min(parsed, max);
  }

  private failConnection(ws: WebSocket, message: string, closeCode: number): void {
    this.sendMessage(ws, {
      type: 'error',
      message,
    });

    ws.close(closeCode);
  }

  private sendMessage(ws: WebSocket, message: TerminalServerMessage): void {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }

    ws.send(JSON.stringify(message));
  }
}
