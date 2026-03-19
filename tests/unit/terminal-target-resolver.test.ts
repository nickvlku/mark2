import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';

const { isSessionAliveMock } = vi.hoisted(() => ({
  isSessionAliveMock: vi.fn(),
}));

vi.mock('@/lib/utils/tmux', () => ({
  isSessionAlive: isSessionAliveMock,
}));

import { closeDb, getDb, initializeDatabase, schema } from '@/lib/db';
import {
  getTerminalSessionResponse,
  resolveActiveTerminalSession,
  resolveLatestTerminalSession,
} from '@/lib/terminal/terminal-target-resolver';

describe('terminal-target-resolver', () => {
  let mark2Dir: string;

  beforeEach(() => {
    vi.clearAllMocks();

    mark2Dir = mkdtempSync(path.join(os.tmpdir(), 'mark2-terminal-resolver-'));
    mkdirSync(path.join(mark2Dir, 'tasks'), { recursive: true });
    mkdirSync(path.join(mark2Dir, 'plans'), { recursive: true });
    initializeDatabase(mark2Dir);
    process.env.MARK2_DIR = mark2Dir;
  });

  afterEach(() => {
    closeDb();
    delete process.env.MARK2_DIR;
    rmSync(mark2Dir, { recursive: true, force: true });
  });

  it('returns the latest running session for a task target', async () => {
    const db = getDb(mark2Dir);
    db.insert(schema.agentSessions).values([
      {
        task_id: 'TASK-1',
        agent_name: 'designer',
        phase: 'design',
        tmux_session: 'mark2_TASK-1_designer_design',
        started_at: '2026-03-18T10:00:00.000Z',
        status: 'running',
      },
      {
        task_id: 'TASK-1',
        agent_name: 'coder',
        phase: 'coding',
        tmux_session: 'mark2_TASK-1_coder_coding',
        started_at: '2026-03-18T11:00:00.000Z',
        status: 'running',
      },
    ]).run();

    isSessionAliveMock.mockResolvedValue(true);

    const session = await resolveLatestTerminalSession({
      kind: 'task',
      id: 'TASK-1',
    });

    expect(session).toEqual({
      tmux_session: 'mark2_TASK-1_coder_coding',
      agent_name: 'coder',
      phase: 'coding',
      status: 'running',
    });
    expect(isSessionAliveMock).toHaveBeenCalledWith('mark2_TASK-1_coder_coding');
  });

  it('returns null for inactive sessions when active session lookup is requested', async () => {
    const db = getDb(mark2Dir);
    db.insert(schema.agentSessions).values({
      task_id: 'PLAN-1',
      agent_name: 'architect',
      phase: 'tech_spec',
      tmux_session: 'mark2_PLAN-1_architect_tech_spec',
      started_at: '2026-03-18T12:00:00.000Z',
      status: 'completed',
    }).run();

    isSessionAliveMock.mockResolvedValue(false);

    const session = await resolveActiveTerminalSession({
      kind: 'plan',
      id: 'PLAN-1',
    });

    expect(session).toBeNull();
  });

  it('returns terminal websocket metadata even when no session exists', async () => {
    const response = await getTerminalSessionResponse({
      kind: 'task',
      id: 'TASK-9',
    });

    expect(response).toEqual({
      session: null,
      terminal: {
        ws_path: '/ws/terminal',
        default_mode: 'observe',
        control_supported: true,
      },
    });
  });
});
