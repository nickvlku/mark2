import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WebSocket } from 'ws';

const {
  spawnMock,
  resolveActiveTerminalSessionMock,
  isValidTerminalTargetMock,
} = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  resolveActiveTerminalSessionMock: vi.fn(),
  isValidTerminalTargetMock: vi.fn(() => true),
}));

vi.mock('node-pty', () => ({
  spawn: spawnMock,
}));

vi.mock('@/lib/terminal/terminal-target-resolver', () => ({
  isTerminalTargetKind: (value: string | null | undefined) =>
    value === 'task' || value === 'plan',
  isValidTerminalTarget: isValidTerminalTargetMock,
  resolveActiveTerminalSession: resolveActiveTerminalSessionMock,
  terminalTargetKey: ({ kind, id }: { kind: string; id: string }) => `${kind}:${id}`,
}));

import { TerminalBridgeManager } from '@/lib/terminal/terminal-bridge-manager';

interface FakePty {
  onData: ReturnType<typeof vi.fn>;
  onExit: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  emitData: (data: string) => void;
  emitExit: (code?: number) => void;
}

class FakeWebSocket {
  readyState: number = WebSocket.OPEN;
  sent: string[] = [];
  closeCodes: number[] = [];
  private handlers = new Map<string, Array<(value?: unknown) => void>>();

  send = vi.fn((message: string) => {
    this.sent.push(message);
  });

  close = vi.fn((code?: number) => {
    this.readyState = WebSocket.CLOSED;
    if (typeof code === 'number') {
      this.closeCodes.push(code);
    }
    this.emit('close');
  });

  on(event: string, handler: (value?: unknown) => void): this {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
    return this;
  }

  emit(event: string, value?: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(value);
    }
  }
}

function createFakePty(): FakePty {
  let onDataHandler: ((data: string) => void) | undefined;
  let onExitHandler:
    | ((event: { exitCode: number; signal?: number }) => void)
    | undefined;

  return {
    onData: vi.fn((handler: (data: string) => void) => {
      onDataHandler = handler;
      return { dispose: vi.fn() };
    }),
    onExit: vi.fn((handler: (event: { exitCode: number; signal?: number }) => void) => {
      onExitHandler = handler;
      return { dispose: vi.fn() };
    }),
    resize: vi.fn(),
    write: vi.fn(),
    kill: vi.fn(),
    emitData: (data: string) => {
      onDataHandler?.(data);
    },
    emitExit: (code = 0) => {
      onExitHandler?.({ exitCode: code });
    },
  };
}

describe('TerminalBridgeManager - Extended Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isValidTerminalTargetMock.mockReturnValue(true);
    resolveActiveTerminalSessionMock.mockResolvedValue({
      tmux_session: 'mark2_TASK-1_coder_coding',
      agent_name: 'coder',
      phase: 'coding',
      status: 'running',
    });
  });

  describe('Error Handling', () => {
    it('rejects connection with invalid target kind', async () => {
      const manager = new TerminalBridgeManager();
      const ws = new FakeWebSocket();

      await manager.handleConnection(
        ws as unknown as WebSocket,
        {
          url: '/ws/terminal?target=invalid&id=TASK-1&mode=observe',
        } as any,
      );

      expect(JSON.parse(ws.sent[0])).toEqual({
        type: 'error',
        message: 'Invalid terminal target.',
      });
      expect(ws.closeCodes).toContain(1008);
    });

    it('rejects connection with missing id', async () => {
      const manager = new TerminalBridgeManager();
      const ws = new FakeWebSocket();

      await manager.handleConnection(
        ws as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&mode=observe',
        } as any,
      );

      expect(JSON.parse(ws.sent[0])).toEqual({
        type: 'error',
        message: 'Invalid terminal target.',
      });
      expect(ws.closeCodes).toContain(1008);
    });

    it('rejects connection when target validation fails', async () => {
      isValidTerminalTargetMock.mockReturnValue(false);
      const manager = new TerminalBridgeManager();
      const ws = new FakeWebSocket();

      await manager.handleConnection(
        ws as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-999&mode=observe',
        } as any,
      );

      expect(JSON.parse(ws.sent[0])).toEqual({
        type: 'error',
        message: 'Invalid terminal target.',
      });
      expect(ws.closeCodes).toContain(1008);
    });

    it('rejects connection when no active session exists', async () => {
      resolveActiveTerminalSessionMock.mockResolvedValue(null);
      const manager = new TerminalBridgeManager();
      const ws = new FakeWebSocket();

      await manager.handleConnection(
        ws as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-1&mode=observe',
        } as any,
      );

      expect(JSON.parse(ws.sent[0])).toEqual({
        type: 'error',
        message: 'No active tmux session.',
      });
      expect(ws.closeCodes).toContain(1008);
    });

    it('handles pty spawn failure and releases control lock', async () => {
      spawnMock.mockImplementation(() => {
        throw new Error('tmux command not found');
      });

      const manager = new TerminalBridgeManager();
      const ws = new FakeWebSocket();

      await manager.handleConnection(
        ws as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-1&mode=control',
        } as any,
      );

      expect(JSON.parse(ws.sent[0])).toEqual({
        type: 'error',
        message: 'tmux command not found',
      });
      expect(ws.closeCodes).toContain(1013);

      // Verify control lock was released by attempting another control connection
      const pty = createFakePty();
      spawnMock.mockReturnValue(pty);
      const ws2 = new FakeWebSocket();

      await manager.handleConnection(
        ws2 as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-1&mode=control',
        } as any,
      );

      expect(JSON.parse(ws2.sent[0])).toEqual({
        type: 'ready',
        session: 'mark2_TASK-1_coder_coding',
        mode: 'control',
      });
    });

    it('ignores invalid JSON messages from client', async () => {
      const pty = createFakePty();
      spawnMock.mockReturnValue(pty);

      const manager = new TerminalBridgeManager();
      const ws = new FakeWebSocket();

      await manager.handleConnection(
        ws as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-1&mode=control',
        } as any,
      );

      // Send invalid JSON
      ws.emit('message', 'not valid JSON');
      ws.emit('message', '{"type": "input", "data": "ls"}incomplete');

      // Should not crash or write anything
      expect(pty.write).not.toHaveBeenCalled();
    });

    it('ignores unknown message types', async () => {
      const pty = createFakePty();
      spawnMock.mockReturnValue(pty);

      const manager = new TerminalBridgeManager();
      const ws = new FakeWebSocket();

      await manager.handleConnection(
        ws as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-1&mode=control',
        } as any,
      );

      ws.emit('message', JSON.stringify({ type: 'unknown', value: 'test' }));

      expect(pty.write).not.toHaveBeenCalled();
      expect(pty.resize).not.toHaveBeenCalled();
    });
  });

  describe('Plan Terminal Support', () => {
    it('handles plan terminals in observe mode', async () => {
      resolveActiveTerminalSessionMock.mockResolvedValue({
        tmux_session: 'mark2_PLAN-1_architect_tech_spec',
        agent_name: 'architect',
        phase: 'tech_spec',
        status: 'running',
      });

      const pty = createFakePty();
      spawnMock.mockReturnValue(pty);

      const manager = new TerminalBridgeManager();
      const ws = new FakeWebSocket();

      await manager.handleConnection(
        ws as unknown as WebSocket,
        {
          url: '/ws/terminal?target=plan&id=PLAN-1&mode=observe',
        } as any,
      );

      expect(JSON.parse(ws.sent[0])).toEqual({
        type: 'ready',
        session: 'mark2_PLAN-1_architect_tech_spec',
        mode: 'observe',
      });
    });

    it('enforces control lock per plan target', async () => {
      resolveActiveTerminalSessionMock.mockResolvedValue({
        tmux_session: 'mark2_PLAN-1_architect_tech_spec',
        agent_name: 'architect',
        phase: 'tech_spec',
        status: 'running',
      });

      const pty = createFakePty();
      spawnMock.mockReturnValue(pty);

      const manager = new TerminalBridgeManager();
      const ws1 = new FakeWebSocket();
      const ws2 = new FakeWebSocket();

      await manager.handleConnection(
        ws1 as unknown as WebSocket,
        {
          url: '/ws/terminal?target=plan&id=PLAN-1&mode=control',
        } as any,
      );

      await manager.handleConnection(
        ws2 as unknown as WebSocket,
        {
          url: '/ws/terminal?target=plan&id=PLAN-1&mode=control',
        } as any,
      );

      expect(JSON.parse(ws2.sent[0])).toEqual({
        type: 'error',
        message: 'Another browser already has control of this terminal.',
      });
    });
  });

  describe('Multiple Connections', () => {
    it('allows multiple observe connections to the same target', async () => {
      const pty1 = createFakePty();
      const pty2 = createFakePty();
      spawnMock.mockReturnValueOnce(pty1).mockReturnValueOnce(pty2);

      const manager = new TerminalBridgeManager();
      const ws1 = new FakeWebSocket();
      const ws2 = new FakeWebSocket();

      await manager.handleConnection(
        ws1 as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-1&mode=observe',
        } as any,
      );

      await manager.handleConnection(
        ws2 as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-1&mode=observe',
        } as any,
      );

      expect(JSON.parse(ws1.sent[0])).toEqual({
        type: 'ready',
        session: 'mark2_TASK-1_coder_coding',
        mode: 'observe',
      });

      expect(JSON.parse(ws2.sent[0])).toEqual({
        type: 'ready',
        session: 'mark2_TASK-1_coder_coding',
        mode: 'observe',
      });

      expect(spawnMock).toHaveBeenCalledTimes(2);
    });

    it('allows control and observe connections to different targets simultaneously', async () => {
      const pty1 = createFakePty();
      const pty2 = createFakePty();
      spawnMock.mockReturnValueOnce(pty1).mockReturnValueOnce(pty2);

      const resolveSession = vi
        .fn()
        .mockResolvedValueOnce({
          tmux_session: 'mark2_TASK-1_coder_coding',
          agent_name: 'coder',
          phase: 'coding',
          status: 'running',
        })
        .mockResolvedValueOnce({
          tmux_session: 'mark2_TASK-2_designer_design',
          agent_name: 'designer',
          phase: 'design',
          status: 'running',
        });

      resolveActiveTerminalSessionMock.mockImplementation(resolveSession);

      const manager = new TerminalBridgeManager();
      const ws1 = new FakeWebSocket();
      const ws2 = new FakeWebSocket();

      await manager.handleConnection(
        ws1 as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-1&mode=control',
        } as any,
      );

      await manager.handleConnection(
        ws2 as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-2&mode=control',
        } as any,
      );

      expect(JSON.parse(ws1.sent[0])).toEqual({
        type: 'ready',
        session: 'mark2_TASK-1_coder_coding',
        mode: 'control',
      });

      expect(JSON.parse(ws2.sent[0])).toEqual({
        type: 'ready',
        session: 'mark2_TASK-2_designer_design',
        mode: 'control',
      });
    });
  });

  describe('Dimension Parsing', () => {
    it('uses default dimensions when not provided', async () => {
      const pty = createFakePty();
      spawnMock.mockReturnValue(pty);

      const manager = new TerminalBridgeManager();
      const ws = new FakeWebSocket();

      await manager.handleConnection(
        ws as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-1&mode=observe',
        } as any,
      );

      expect(spawnMock).toHaveBeenCalledWith(
        'tmux',
        expect.any(Array),
        expect.objectContaining({
          cols: 120, // DEFAULT_COLS
          rows: 32,  // DEFAULT_ROWS
        }),
      );
    });

    it('parses valid dimension strings', async () => {
      const pty = createFakePty();
      spawnMock.mockReturnValue(pty);

      const manager = new TerminalBridgeManager();
      const ws = new FakeWebSocket();

      await manager.handleConnection(
        ws as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-1&mode=observe&cols=100&rows=30',
        } as any,
      );

      expect(spawnMock).toHaveBeenCalledWith(
        'tmux',
        expect.any(Array),
        expect.objectContaining({
          cols: 100,
          rows: 30,
        }),
      );
    });

    it('clamps dimensions to maximum values', async () => {
      const pty = createFakePty();
      spawnMock.mockReturnValue(pty);

      const manager = new TerminalBridgeManager();
      const ws = new FakeWebSocket();

      await manager.handleConnection(
        ws as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-1&mode=observe&cols=1000&rows=500',
        } as any,
      );

      expect(spawnMock).toHaveBeenCalledWith(
        'tmux',
        expect.any(Array),
        expect.objectContaining({
          cols: 400, // MAX_COLS
          rows: 200, // MAX_ROWS
        }),
      );
    });

    it('uses fallback for invalid dimension values', async () => {
      const pty = createFakePty();
      spawnMock.mockReturnValue(pty);

      const manager = new TerminalBridgeManager();
      const ws = new FakeWebSocket();

      await manager.handleConnection(
        ws as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-1&mode=observe&cols=invalid&rows=-5',
        } as any,
      );

      expect(spawnMock).toHaveBeenCalledWith(
        'tmux',
        expect.any(Array),
        expect.objectContaining({
          cols: 120,
          rows: 32,
        }),
      );
    });
  });

  describe('Cleanup and Lifecycle', () => {
    it('cleans up PTY on WebSocket close', async () => {
      const pty = createFakePty();
      spawnMock.mockReturnValue(pty);

      const manager = new TerminalBridgeManager();
      const ws = new FakeWebSocket();

      await manager.handleConnection(
        ws as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-1&mode=observe',
        } as any,
      );

      ws.emit('close');

      expect(pty.kill).toHaveBeenCalled();
    });

    it('cleans up WebSocket on PTY exit', async () => {
      const pty = createFakePty();
      spawnMock.mockReturnValue(pty);

      const manager = new TerminalBridgeManager();
      const ws = new FakeWebSocket();

      await manager.handleConnection(
        ws as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-1&mode=observe',
        } as any,
      );

      pty.emitExit(0);

      expect(ws.sent[ws.sent.length - 1]).toBe(
        JSON.stringify({ type: 'exit', code: 0 }),
      );
      expect(ws.close).toHaveBeenCalled();
    });

    it('releases control lock on disconnect', async () => {
      const pty1 = createFakePty();
      const pty2 = createFakePty();
      spawnMock.mockReturnValueOnce(pty1).mockReturnValueOnce(pty2);

      const manager = new TerminalBridgeManager();
      const ws1 = new FakeWebSocket();

      await manager.handleConnection(
        ws1 as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-1&mode=control',
        } as any,
      );

      ws1.emit('close');

      // Should be able to acquire control again
      const ws2 = new FakeWebSocket();
      await manager.handleConnection(
        ws2 as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-1&mode=control',
        } as any,
      );

      expect(JSON.parse(ws2.sent[0])).toEqual({
        type: 'ready',
        session: 'mark2_TASK-1_coder_coding',
        mode: 'control',
      });
    });

    it('disposes all bridges on disposeAll', async () => {
      const pty1 = createFakePty();
      const pty2 = createFakePty();
      spawnMock.mockReturnValueOnce(pty1).mockReturnValueOnce(pty2);

      const manager = new TerminalBridgeManager();
      const ws1 = new FakeWebSocket();
      const ws2 = new FakeWebSocket();

      await manager.handleConnection(
        ws1 as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-1&mode=observe',
        } as any,
      );

      await manager.handleConnection(
        ws2 as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-2&mode=observe',
        } as any,
      );

      manager.disposeAll();

      expect(pty1.kill).toHaveBeenCalled();
      expect(pty2.kill).toHaveBeenCalled();
    });

    it('handles cleanup errors gracefully', async () => {
      const pty = createFakePty();
      pty.kill.mockImplementation(() => {
        throw new Error('already killed');
      });
      spawnMock.mockReturnValue(pty);

      const manager = new TerminalBridgeManager();
      const ws = new FakeWebSocket();

      await manager.handleConnection(
        ws as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-1&mode=observe',
        } as any,
      );

      // Should not throw
      expect(() => ws.emit('close')).not.toThrow();
    });
  });

  describe('Input Handling', () => {
    it('ignores input in observe mode', async () => {
      const pty = createFakePty();
      spawnMock.mockReturnValue(pty);

      const manager = new TerminalBridgeManager();
      const ws = new FakeWebSocket();

      await manager.handleConnection(
        ws as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-1&mode=observe',
        } as any,
      );

      ws.emit('message', JSON.stringify({ type: 'input', data: 'rm -rf /' }));

      expect(pty.write).not.toHaveBeenCalled();
    });

    it('ignores input with missing data field', async () => {
      const pty = createFakePty();
      spawnMock.mockReturnValue(pty);

      const manager = new TerminalBridgeManager();
      const ws = new FakeWebSocket();

      await manager.handleConnection(
        ws as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-1&mode=control',
        } as any,
      );

      ws.emit('message', JSON.stringify({ type: 'input' }));

      expect(pty.write).not.toHaveBeenCalled();
    });

    it('handles empty input data', async () => {
      const pty = createFakePty();
      spawnMock.mockReturnValue(pty);

      const manager = new TerminalBridgeManager();
      const ws = new FakeWebSocket();

      await manager.handleConnection(
        ws as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-1&mode=control',
        } as any,
      );

      ws.emit('message', JSON.stringify({ type: 'input', data: '' }));

      expect(pty.write).not.toHaveBeenCalled();
    });
  });

  describe('PTY Exit Codes', () => {
    it('sends exit message with non-zero code', async () => {
      const pty = createFakePty();
      spawnMock.mockReturnValue(pty);

      const manager = new TerminalBridgeManager();
      const ws = new FakeWebSocket();

      await manager.handleConnection(
        ws as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-1&mode=observe',
        } as any,
      );

      pty.emitExit(127);

      expect(JSON.parse(ws.sent[ws.sent.length - 1])).toEqual({
        type: 'exit',
        code: 127,
      });
    });

    it('handles undefined exit code as 0', async () => {
      const pty = createFakePty();
      spawnMock.mockReturnValue(pty);

      const manager = new TerminalBridgeManager();
      const ws = new FakeWebSocket();

      await manager.handleConnection(
        ws as unknown as WebSocket,
        {
          url: '/ws/terminal?target=task&id=TASK-1&mode=observe',
        } as any,
      );

      pty.emitExit(undefined);

      expect(JSON.parse(ws.sent[ws.sent.length - 1])).toEqual({
        type: 'exit',
        code: 0,
      });
    });
  });
});
