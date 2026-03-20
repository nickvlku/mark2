/** @vitest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveTerminal } from '@/components/shared/LiveTerminal';

class MockFitAddon {
  fit() {}
}

class MockTerminal {
  static instances: MockTerminal[] = [];

  options: { disableStdin?: boolean };
  cols = 120;
  rows = 32;
  onDataHandler?: (data: string) => void;
  focus = vi.fn();
  open = vi.fn();
  loadAddon = vi.fn();
  dispose = vi.fn();
  write = vi.fn();
  writeln = vi.fn();

  constructor(options: { disableStdin?: boolean }) {
    this.options = options;
    MockTerminal.instances.push(this);
  }

  onData(handler: (data: string) => void) {
    this.onDataHandler = handler;
    return { dispose() {} };
  }
}

vi.mock('xterm', () => ({
  Terminal: MockTerminal,
}));

vi.mock('xterm-addon-fit', () => ({
  FitAddon: MockFitAddon,
}));

class MockResizeObserver {
  observe() {}
  disconnect() {}
}

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(url: string | URL) {
    this.url = String(url);
    MockWebSocket.instances.push(this);
  }

  send(message: string) {
    this.sent.push(message);
  }

  close(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason } as CloseEvent);
  }

  emitOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  emitMessage(message: unknown) {
    this.onmessage?.({
      data: JSON.stringify(message),
    } as MessageEvent<string>);
  }

  emitClose(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason } as CloseEvent);
  }
}

describe('LiveTerminal', () => {
  beforeEach(() => {
    MockTerminal.instances = [];
    MockWebSocket.instances = [];
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts task terminals in control mode from session metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          session: {
            tmux_session: 'mark2_TASK-89_coder_coding',
            agent_name: 'coder',
            phase: 'coding',
            status: 'running',
          },
          terminal: {
            ws_path: '/ws/terminal',
            default_mode: 'control',
            control_supported: true,
          },
        }),
      }),
    );

    render(
      <LiveTerminal
        targetKind="task"
        targetId="TASK-89"
        sessionEndpoint="/api/tasks/TASK-89/session"
        openTerminalEndpoint="/api/tasks/TASK-89/session"
      />,
    );

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const url = new URL(MockWebSocket.instances[0].url);
    expect(url.searchParams.get('mode')).toBe('control');
  });

  it('falls back to observe mode on control conflict and can retry control', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          session: {
            tmux_session: 'mark2_TASK-89_coder_coding',
            agent_name: 'coder',
            phase: 'coding',
            status: 'running',
          },
          terminal: {
            ws_path: '/ws/terminal',
            default_mode: 'control',
            control_supported: true,
          },
        }),
      }),
    );

    render(
      <LiveTerminal
        targetKind="task"
        targetId="TASK-89"
        sessionEndpoint="/api/tasks/TASK-89/session"
        openTerminalEndpoint="/api/tasks/TASK-89/session"
      />,
    );

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    await act(async () => {
      MockWebSocket.instances[0].emitMessage({
        type: 'error',
        message: 'Another browser already has control of this terminal.',
      });
      MockWebSocket.instances[0].emitClose(4409);
    });

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(2);
    });

    expect(new URL(MockWebSocket.instances[1].url).searchParams.get('mode')).toBe('observe');
    expect(
      screen.getByText('Viewing only. Another browser currently has control of this terminal.'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Retry Control' }));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(3);
    });

    expect(new URL(MockWebSocket.instances[2].url).searchParams.get('mode')).toBe('control');
  });
});
