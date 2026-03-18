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

describe('TerminalBridgeManager', () => {
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

  it('spawns a read-only tmux client for observe mode and forwards output', async () => {
    const pty = createFakePty();
    spawnMock.mockReturnValue(pty);

    const manager = new TerminalBridgeManager();
    const ws = new FakeWebSocket();

    await manager.handleConnection(
      ws as unknown as WebSocket,
      {
        url: '/ws/terminal?target=task&id=TASK-1&mode=observe&cols=140&rows=40',
      } as any,
    );

    expect(spawnMock).toHaveBeenCalledWith(
      'tmux',
      ['attach-session', '-f', 'read-only', '-t', 'mark2_TASK-1_coder_coding'],
      expect.objectContaining({
        cols: 140,
        rows: 40,
        name: 'xterm-256color',
      }),
    );

    expect(JSON.parse(ws.sent[0])).toEqual({
      type: 'ready',
      session: 'mark2_TASK-1_coder_coding',
      mode: 'observe',
    });

    pty.emitData('\u001b[31mred\u001b[0m');
    expect(JSON.parse(ws.sent[1])).toEqual({
      type: 'output',
      data: '\u001b[31mred\u001b[0m',
    });
  });

  it('forwards resize and input messages in control mode', async () => {
    const pty = createFakePty();
    spawnMock.mockReturnValue(pty);

    const manager = new TerminalBridgeManager();
    const ws = new FakeWebSocket();

    await manager.handleConnection(
      ws as unknown as WebSocket,
      {
        url: '/ws/terminal?target=task&id=TASK-1&mode=control&cols=100&rows=30',
      } as any,
    );

    ws.emit('message', JSON.stringify({ type: 'resize', cols: 88, rows: 22 }));
    ws.emit('message', JSON.stringify({ type: 'input', data: 'ls\r' }));

    expect(pty.resize).toHaveBeenCalledWith(88, 22);
    expect(pty.write).toHaveBeenCalledWith('ls\r');
  });

  it('enforces a single control connection per target', async () => {
    const firstPty = createFakePty();
    const secondPty = createFakePty();
    spawnMock.mockReturnValueOnce(firstPty).mockReturnValueOnce(secondPty);

    const manager = new TerminalBridgeManager();
    const firstWs = new FakeWebSocket();
    const secondWs = new FakeWebSocket();

    await manager.handleConnection(
      firstWs as unknown as WebSocket,
      {
        url: '/ws/terminal?target=task&id=TASK-1&mode=control',
      } as any,
    );

    await manager.handleConnection(
      secondWs as unknown as WebSocket,
      {
        url: '/ws/terminal?target=task&id=TASK-1&mode=control',
      } as any,
    );

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(secondWs.sent[0])).toEqual({
      type: 'error',
      message: 'Another browser already has control of this terminal.',
    });
    expect(secondWs.closeCodes).toEqual([4409]);

    firstWs.emit('close');

    const thirdWs = new FakeWebSocket();
    await manager.handleConnection(
      thirdWs as unknown as WebSocket,
      {
        url: '/ws/terminal?target=task&id=TASK-1&mode=control',
      } as any,
    );

    expect(spawnMock).toHaveBeenCalledTimes(2);
  });
});
