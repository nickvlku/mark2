import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { GET as getTaskSession, POST as postTaskSession } from '@/app/api/tasks/[id]/session/route';
import { GET as getPlanSession, POST as postPlanSession } from '@/app/api/plans/[id]/session/route';

const { isSessionAliveMock, openTmuxSessionMock } = vi.hoisted(() => ({
  isSessionAliveMock: vi.fn(),
  openTmuxSessionMock: vi.fn(),
}));

vi.mock('@/lib/utils/tmux', () => ({
  isSessionAlive: isSessionAliveMock,
}));

vi.mock('@/lib/terminal/native-terminal', () => ({
  openTmuxSessionInNativeTerminal: openTmuxSessionMock,
}));

import { closeDb, getDb, initializeDatabase, schema } from '@/lib/db';

describe('Terminal Session Routes', () => {
  let mark2Dir: string;

  beforeEach(() => {
    vi.clearAllMocks();

    mark2Dir = mkdtempSync(path.join(os.tmpdir(), 'mark2-session-routes-'));
    mkdirSync(path.join(mark2Dir, 'tasks'), { recursive: true });
    mkdirSync(path.join(mark2Dir, 'plans'), { recursive: true });
    initializeDatabase(mark2Dir);
    process.env.MARK2_DIR = mark2Dir;

    isSessionAliveMock.mockResolvedValue(true);
  });

  afterEach(() => {
    closeDb();
    delete process.env.MARK2_DIR;
    rmSync(mark2Dir, { recursive: true, force: true });
  });

  describe('GET /api/tasks/[id]/session', () => {
    it('returns terminal metadata and session info for active task', async () => {
      const db = getDb(mark2Dir);
      db.insert(schema.agentSessions).values({
        task_id: 'TASK-1',
        agent_name: 'coder',
        phase: 'coding',
        tmux_session: 'mark2_TASK-1_coder_coding',
        started_at: '2026-03-18T10:00:00.000Z',
        status: 'running',
      }).run();

      const response = await getTaskSession(
        new Request('http://localhost:3000/api/tasks/TASK-1/session'),
        { params: Promise.resolve({ id: 'TASK-1' }) },
      );

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toEqual({
        session: {
          tmux_session: 'mark2_TASK-1_coder_coding',
          agent_name: 'coder',
          phase: 'coding',
          status: 'running',
        },
        terminal: {
          ws_path: '/ws/terminal',
          default_mode: 'observe',
          control_supported: true,
        },
      });
    });

    it('returns terminal metadata with null session when no active session exists', async () => {
      const response = await getTaskSession(
        new Request('http://localhost:3000/api/tasks/TASK-999/session'),
        { params: Promise.resolve({ id: 'TASK-999' }) },
      );

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toEqual({
        session: null,
        terminal: {
          ws_path: '/ws/terminal',
          default_mode: 'observe',
          control_supported: true,
        },
      });
    });

    it('returns 400 for invalid task ID', async () => {
      const response = await getTaskSession(
        new Request('http://localhost:3000/api/tasks/invalid/session'),
        { params: Promise.resolve({ id: 'invalid' }) },
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'Invalid task ID' });
    });

    it('returns session with completed status when session ended', async () => {
      const db = getDb(mark2Dir);
      db.insert(schema.agentSessions).values({
        task_id: 'TASK-1',
        agent_name: 'coder',
        phase: 'coding',
        tmux_session: 'mark2_TASK-1_coder_coding',
        started_at: '2026-03-18T10:00:00.000Z',
        ended_at: '2026-03-18T10:30:00.000Z',
        status: 'completed',
      }).run();

      isSessionAliveMock.mockResolvedValue(false);

      const response = await getTaskSession(
        new Request('http://localhost:3000/api/tasks/TASK-1/session'),
        { params: Promise.resolve({ id: 'TASK-1' }) },
      );

      expect(response.status).toBe(200);
      const data = await response.json();

      // resolveLatestTerminalSession returns completed session info
      expect(data.session).not.toBeNull();
      expect(data.session?.status).toBe('completed');
      expect(data.session?.tmux_session).toBe('mark2_TASK-1_coder_coding');
    });
  });

  describe('POST /api/tasks/[id]/session', () => {
    it('opens tmux session in native terminal for active session', async () => {
      const db = getDb(mark2Dir);
      db.insert(schema.agentSessions).values({
        task_id: 'TASK-1',
        agent_name: 'coder',
        phase: 'coding',
        tmux_session: 'mark2_TASK-1_coder_coding',
        started_at: '2026-03-18T10:00:00.000Z',
        status: 'running',
      }).run();

      openTmuxSessionMock.mockResolvedValue({
        success: true,
        message: 'Terminal opened',
      });

      const response = await postTaskSession(
        new Request('http://localhost:3000/api/tasks/TASK-1/session', {
          method: 'POST',
        }),
        { params: Promise.resolve({ id: 'TASK-1' }) },
      );

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toEqual({
        success: true,
        message: 'Terminal opened',
      });

      expect(openTmuxSessionMock).toHaveBeenCalledWith('mark2_TASK-1_coder_coding');
    });

    it('returns 404 when no active session exists', async () => {
      const response = await postTaskSession(
        new Request('http://localhost:3000/api/tasks/TASK-999/session', {
          method: 'POST',
        }),
        { params: Promise.resolve({ id: 'TASK-999' }) },
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: 'No active tmux session for this task' });
    });

    it('returns 400 for invalid task ID', async () => {
      const response = await postTaskSession(
        new Request('http://localhost:3000/api/tasks/invalid/session', {
          method: 'POST',
        }),
        { params: Promise.resolve({ id: 'invalid' }) },
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'Invalid task ID' });
    });

    it('returns 500 with manual command when terminal open fails', async () => {
      const db = getDb(mark2Dir);
      db.insert(schema.agentSessions).values({
        task_id: 'TASK-1',
        agent_name: 'coder',
        phase: 'coding',
        tmux_session: 'mark2_TASK-1_coder_coding',
        started_at: '2026-03-18T10:00:00.000Z',
        status: 'running',
      }).run();

      openTmuxSessionMock.mockResolvedValue({
        success: false,
        error: 'Failed to detect terminal emulator',
        manual_command: 'tmux attach-session -t mark2_TASK-1_coder_coding',
      });

      const response = await postTaskSession(
        new Request('http://localhost:3000/api/tasks/TASK-1/session', {
          method: 'POST',
        }),
        { params: Promise.resolve({ id: 'TASK-1' }) },
      );

      expect(response.status).toBe(500);
      const data = await response.json();

      expect(data).toEqual({
        error: 'Failed to detect terminal emulator',
        manual_command: 'tmux attach-session -t mark2_TASK-1_coder_coding',
      });
    });
  });

  describe('GET /api/plans/[id]/session', () => {
    it('returns terminal metadata and session info for active plan', async () => {
      const db = getDb(mark2Dir);
      db.insert(schema.agentSessions).values({
        task_id: 'PLAN-1', // Note: plans use task_id column
        agent_name: 'architect',
        phase: 'tech_spec',
        tmux_session: 'mark2_PLAN-1_architect_tech_spec',
        started_at: '2026-03-18T11:00:00.000Z',
        status: 'running',
      }).run();

      const response = await getPlanSession(
        new Request('http://localhost:3000/api/plans/PLAN-1/session'),
        { params: Promise.resolve({ id: 'PLAN-1' }) },
      );

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toEqual({
        session: {
          tmux_session: 'mark2_PLAN-1_architect_tech_spec',
          agent_name: 'architect',
          phase: 'tech_spec',
          status: 'running',
        },
        terminal: {
          ws_path: '/ws/terminal',
          default_mode: 'observe',
          control_supported: true,
        },
      });
    });

    it('returns terminal metadata with null session when no active session exists', async () => {
      const response = await getPlanSession(
        new Request('http://localhost:3000/api/plans/PLAN-999/session'),
        { params: Promise.resolve({ id: 'PLAN-999' }) },
      );

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toEqual({
        session: null,
        terminal: {
          ws_path: '/ws/terminal',
          default_mode: 'observe',
          control_supported: true,
        },
      });
    });

    it('returns 400 for invalid plan ID', async () => {
      const response = await getPlanSession(
        new Request('http://localhost:3000/api/plans/invalid/session'),
        { params: Promise.resolve({ id: 'invalid' }) },
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: 'Invalid plan ID' });
    });
  });

  describe('POST /api/plans/[id]/session', () => {
    it('opens tmux session in native terminal for active plan session', async () => {
      const db = getDb(mark2Dir);
      db.insert(schema.agentSessions).values({
        task_id: 'PLAN-1', // Note: plans use task_id column
        agent_name: 'architect',
        phase: 'tech_spec',
        tmux_session: 'mark2_PLAN-1_architect_tech_spec',
        started_at: '2026-03-18T11:00:00.000Z',
        status: 'running',
      }).run();

      openTmuxSessionMock.mockResolvedValue({
        success: true,
        message: 'Terminal opened',
      });

      const response = await postPlanSession(
        new Request('http://localhost:3000/api/plans/PLAN-1/session', {
          method: 'POST',
        }),
        { params: Promise.resolve({ id: 'PLAN-1' }) },
      );

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toEqual({
        success: true,
        message: 'Terminal opened',
      });

      expect(openTmuxSessionMock).toHaveBeenCalledWith('mark2_PLAN-1_architect_tech_spec');
    });

    it('returns 404 when no active plan session exists', async () => {
      const response = await postPlanSession(
        new Request('http://localhost:3000/api/plans/PLAN-999/session', {
          method: 'POST',
        }),
        { params: Promise.resolve({ id: 'PLAN-999' }) },
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: 'No active tmux session for this plan' });
    });
  });
});
