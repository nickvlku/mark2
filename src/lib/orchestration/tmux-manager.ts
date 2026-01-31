import {
  sessionName as buildSessionName,
  createSession,
  sendCommand,
  killSession,
  listMark2Sessions,
  isSessionAlive,
} from '../utils/tmux';
import type { Phase } from '../yaml/schemas';

// ── Types ───────────────────────────────────────────────────────────────────

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
   * Spawn a new TMUX session for a role execution.
   *
   * Note: Database session tracking has been removed with the legacy agents system.
   * The roles system uses simpler tmux-only session management.
   */
  async spawnAgent(options: SpawnOptions): Promise<string> {
    const { taskId, agentName, phase, command, workingDir, env } = options;
    const tmuxName = buildSessionName(taskId, agentName, phase);

    // Kill any existing session with the same name
    await killSession(tmuxName);

    // Create TMUX session
    await createSession(tmuxName, workingDir);

    // Set environment variables in the session if provided
    if (env) {
      for (const [key, value] of Object.entries(env)) {
        await sendCommand(tmuxName, `export ${key}=${JSON.stringify(value)}`);
      }
    }

    // Send the agent command
    await sendCommand(tmuxName, command);

    return tmuxName;
  }

  /**
   * Kill a TMUX session.
   */
  async killAgent(taskId: string, agentName: string, phase: Phase): Promise<void> {
    const tmuxName = buildSessionName(taskId, agentName, phase);

    // Kill the TMUX session
    await killSession(tmuxName);
  }

  /**
   * List all active mark2 tmux sessions.
   */
  async getActiveSessions(): Promise<string[]> {
    return await listMark2Sessions();
  }

  /**
   * Kill all active Mark2 TMUX sessions.
   */
  async cleanupSessions(): Promise<number> {
    const sessions = await listMark2Sessions();

    for (const sessionName of sessions) {
      await killSession(sessionName);
    }

    return sessions.length;
  }

  /**
   * Check if a specific session is still alive.
   */
  async isSessionAlive(sessionName: string): Promise<boolean> {
    return await isSessionAlive(sessionName);
  }
}