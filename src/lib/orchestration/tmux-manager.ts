import {
  sessionName as buildSessionName,
  createSession,
  sendCommand,
  killSession,
  listMark2Sessions,
  isSessionAlive,
} from '../utils/tmux';
import { getDb } from '../db';
import { agentSessions } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import type { Phase } from '../yaml/schemas';

// ── Types ───────────────────────────────────────────────────────────────────

export interface AgentSessionRecord {
  id: number;
  task_id: string;
  agent_name: string;
  phase: string;
  tmux_session: string;
  pid: number | null;
  started_at: string;
  ended_at: string | null;
  exit_code: number | null;
  status: string;
}

export interface SpawnOptions {
  taskId: string;
  agentName: string;
  phase: Phase;
  command: string;
  workingDir: string;
  env?: Record<string, string>;
}

// ── TmuxManager ─────────────────────────────────────────────────────────────

export class TmuxManager {
  private mark2Dir: string;

  constructor(mark2Dir: string) {
    this.mark2Dir = mark2Dir;
  }

  /**
   * Create a TMUX session, send the agent command, and record it in the
   * agent_sessions table.
   */
  async spawnAgent(options: SpawnOptions): Promise<string> {
    const { taskId, agentName, phase, command, workingDir, env } = options;
    const tmuxName = buildSessionName(taskId, agentName, phase);

    // Kill any existing session with the same name
    await killSession(tmuxName);

    // Create TMUX session
    await createSession(tmuxName, workingDir);

    // Record in database
    const db = getDb(this.mark2Dir);
    const now = new Date().toISOString();

    db.insert(agentSessions)
      .values({
        task_id: taskId,
        agent_name: agentName,
        phase,
        tmux_session: tmuxName,
        pid: null,
        started_at: now,
        ended_at: null,
        exit_code: null,
        status: 'running',
      })
      .run();

    try {
      const commandLines: string[] = [];

      // Set environment variables first in the same shell invocation
      if (env) {
        for (const [key, value] of Object.entries(env)) {
          commandLines.push(`export ${key}=${JSON.stringify(value)}`);
        }
      }

      // Run the agent command after exports
      commandLines.push(command);
      await sendCommand(tmuxName, commandLines.join('\n'));
    } catch (err) {
      // Mark session as failed if we couldn't send the command
      db.update(agentSessions)
        .set({ status: 'failed', ended_at: new Date().toISOString() })
        .where(eq(agentSessions.tmux_session, tmuxName))
        .run();
      throw err;
    }

    return tmuxName;
  }

  /**
   * Kill a TMUX session and update its database record.
   */
  async killAgent(taskId: string, agentName: string, phase: Phase): Promise<void> {
    const tmuxName = buildSessionName(taskId, agentName, phase);
    const now = new Date().toISOString();

    // Kill the TMUX session
    await killSession(tmuxName);

    // Update database record
    const db = getDb(this.mark2Dir);
    db.update(agentSessions)
      .set({
        ended_at: now,
        status: 'killed',
      })
      .where(
        and(
          eq(agentSessions.task_id, taskId),
          eq(agentSessions.agent_name, agentName),
          eq(agentSessions.phase, phase),
          eq(agentSessions.status, 'running'),
        ),
      )
      .run();
  }

  /**
   * List all active (running) agent sessions from the database.
   */
  getActiveSessions(): AgentSessionRecord[] {
    const db = getDb(this.mark2Dir);
    const rows = db
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.status, 'running'))
      .all();

    return rows as AgentSessionRecord[];
  }

  /**
   * Get all sessions (any status) for a specific task.
   */
  getSessionsForTask(taskId: string): AgentSessionRecord[] {
    const db = getDb(this.mark2Dir);
    const rows = db
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.task_id, taskId))
      .all();

    return rows as AgentSessionRecord[];
  }

  /**
   * Get the currently running session for a task, if any.
   */
  getActiveSessionForTask(taskId: string): AgentSessionRecord | undefined {
    const db = getDb(this.mark2Dir);
    const row = db
      .select()
      .from(agentSessions)
      .where(
        and(
          eq(agentSessions.task_id, taskId),
          eq(agentSessions.status, 'running'),
        ),
      )
      .get();

    return row as AgentSessionRecord | undefined;
  }

  /**
   * Mark a session as completed with an optional exit code.
   * Matches by tmux_session name.
   */
  markCompleted(tmuxSessionName: string, exitCode?: number): void {
    const db = getDb(this.mark2Dir);
    const now = new Date().toISOString();

    db.update(agentSessions)
      .set({
        ended_at: now,
        exit_code: exitCode ?? null,
        status: 'completed',
      })
      .where(
        and(
          eq(agentSessions.tmux_session, tmuxSessionName),
          eq(agentSessions.status, 'running'),
        ),
      )
      .run();
  }

  /**
   * Mark a session as completed by task_id and phase.
   * More robust than matching by exact tmux session name.
   */
  markCompletedByPhase(taskId: string, phase: string, exitCode?: number): void {
    const db = getDb(this.mark2Dir);
    const now = new Date().toISOString();

    db.update(agentSessions)
      .set({
        ended_at: now,
        exit_code: exitCode ?? null,
        status: 'completed',
      })
      .where(
        and(
          eq(agentSessions.task_id, taskId),
          eq(agentSessions.phase, phase),
          eq(agentSessions.status, 'running'),
        ),
      )
      .run();
  }

  /**
   * Mark a session as failed.
   * Matches by tmux_session name.
   */
  markFailed(tmuxSessionName: string): void {
    const db = getDb(this.mark2Dir);
    const now = new Date().toISOString();

    db.update(agentSessions)
      .set({
        ended_at: now,
        status: 'failed',
      })
      .where(
        and(
          eq(agentSessions.tmux_session, tmuxSessionName),
          eq(agentSessions.status, 'running'),
        ),
      )
      .run();
  }

  /**
   * Mark a session as failed by task_id and phase.
   * More robust than matching by exact tmux session name.
   */
  markFailedByPhase(taskId: string, phase: string): void {
    const db = getDb(this.mark2Dir);
    const now = new Date().toISOString();

    db.update(agentSessions)
      .set({
        ended_at: now,
        status: 'failed',
      })
      .where(
        and(
          eq(agentSessions.task_id, taskId),
          eq(agentSessions.phase, phase),
          eq(agentSessions.status, 'running'),
        ),
      )
      .run();
  }

  /**
   * Kill all mark2 TMUX sessions and mark them as killed in the database.
   */
  async cleanupSessions(): Promise<number> {
    const sessions = await listMark2Sessions();
    const now = new Date().toISOString();

    for (const name of sessions) {
      await killSession(name);
    }

    // Mark all running sessions as killed
    const db = getDb(this.mark2Dir);
    db.update(agentSessions)
      .set({
        ended_at: now,
        status: 'killed',
      })
      .where(eq(agentSessions.status, 'running'))
      .run();

    return sessions.length;
  }

  /**
   * Reconcile database records with actual TMUX sessions.
   * Finds sessions marked as running in DB but no longer alive in TMUX.
   */
  async reconcile(): Promise<AgentSessionRecord[]> {
    const activeSessions = this.getActiveSessions();
    const orphaned: AgentSessionRecord[] = [];

    for (const session of activeSessions) {
      const alive = await isSessionAlive(session.tmux_session);
      if (!alive) {
        this.markFailed(session.tmux_session);
        orphaned.push(session);
      }
    }

    return orphaned;
  }

  /**
   * Check if a specific session is still alive.
   */
  async isSessionAlive(sessionName: string): Promise<boolean> {
    return await isSessionAlive(sessionName);
  }
}
