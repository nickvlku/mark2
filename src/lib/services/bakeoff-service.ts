import { WorktreeService } from './worktree-service';
import { TmuxManager } from '../orchestration/tmux-manager';
import { ActivityService } from './activity-service';
import { removeWorktree } from '../utils/git';
import { randomUUID } from 'crypto';
import path from 'path';
import type { Phase } from '../yaml/schemas';

// ── Types ───────────────────────────────────────────────────────────────────

export interface BakeoffConfig {
  taskId: string;
  agents: string[];
  phase: Phase;
}

export interface BakeoffAgentResult {
  agentName: string;
  status: 'completed' | 'failed' | 'timeout' | 'running' | 'cancelled';
  endToken?: string;
  duration_ms: number;
}

export interface BakeoffResult {
  taskId: string;
  winner?: string;
  results: BakeoffAgentResult[];
}

interface BakeoffState {
  id: string;
  taskId: string;
  phase: Phase;
  agents: string[];
  startedAt: number;
  results: Map<string, BakeoffAgentResult>;
  worktrees: Map<string, { worktreePath: string; branchName: string }>;
  tmuxSessions: Map<string, string>;
  cancelled: boolean;
  winner?: string;
}

// ── Service ─────────────────────────────────────────────────────────────────

export class BakeoffService {
  private projectRoot: string;
  private mark2Dir: string;
  private worktreeService: WorktreeService;
  private tmuxManager: TmuxManager;
  private activityService: ActivityService;

  /** In-memory state for active bake-offs (ephemeral). */
  private bakeoffs: Map<string, BakeoffState> = new Map();

  constructor(projectRoot: string, mark2Dir: string) {
    this.projectRoot = projectRoot;
    this.mark2Dir = mark2Dir;
    this.worktreeService = new WorktreeService(mark2Dir);
    this.tmuxManager = new TmuxManager(mark2Dir);
    this.activityService = new ActivityService(mark2Dir);
  }

  /**
   * Start a bake-off: create separate worktrees and spawn agents in parallel.
   * Returns a unique bake-off ID.
   */
  async start(config: BakeoffConfig): Promise<string> {
    const bakeoffId = randomUUID();
    const state: BakeoffState = {
      id: bakeoffId,
      taskId: config.taskId,
      phase: config.phase,
      agents: config.agents,
      startedAt: Date.now(),
      results: new Map(),
      worktrees: new Map(),
      tmuxSessions: new Map(),
      cancelled: false,
    };

    // Create a worktree and TMUX session for each agent
    for (const agentName of config.agents) {
      const record = await this.worktreeService.create(
        config.taskId,
        agentName,
        true, // isBakeoff
      );

      state.worktrees.set(agentName, {
        worktreePath: record.worktree_path,
        branchName: record.branch_name,
      });

      const tmuxSession = await this.tmuxManager.spawnAgent({
        taskId: config.taskId,
        agentName,
        phase: config.phase,
        command: `echo "Bake-off agent ${agentName} started for ${config.taskId} phase ${config.phase}"`,
        workingDir: record.worktree_path,
      });

      state.tmuxSessions.set(agentName, tmuxSession);
      state.results.set(agentName, {
        agentName,
        status: 'running',
        duration_ms: 0,
      });
    }

    this.bakeoffs.set(bakeoffId, state);

    this.activityService.log(
      config.taskId,
      'system',
      'note',
      `Bake-off ${bakeoffId} started with agents: ${config.agents.join(', ')}`,
      { bakeoff_id: bakeoffId, phase: config.phase, agents: config.agents },
    );

    return bakeoffId;
  }

  /**
   * Check bake-off status and return current results.
   */
  getStatus(bakeoffId: string): BakeoffResult | null {
    const state = this.bakeoffs.get(bakeoffId);
    if (!state) return null;

    const results: BakeoffAgentResult[] = [];
    for (const agentName of state.agents) {
      const result = state.results.get(agentName);
      if (result) {
        // Update duration for running agents
        if (result.status === 'running') {
          result.duration_ms = Date.now() - state.startedAt;
        }
        results.push(result);
      }
    }

    return {
      taskId: state.taskId,
      winner: state.winner,
      results,
    };
  }

  /**
   * Select the winner of a bake-off and clean up losing worktrees.
   */
  async selectWinner(bakeoffId: string, winnerAgent: string): Promise<void> {
    const state = this.bakeoffs.get(bakeoffId);
    if (!state) {
      throw new Error(`Bake-off ${bakeoffId} not found`);
    }

    if (!state.agents.includes(winnerAgent)) {
      throw new Error(`Agent ${winnerAgent} is not part of bake-off ${bakeoffId}`);
    }

    state.winner = winnerAgent;

    // Clean up losing agents' worktrees and TMUX sessions
    for (const agentName of state.agents) {
      if (agentName === winnerAgent) continue;

      // Kill TMUX session
      try {
        await this.tmuxManager.killAgent(state.taskId, agentName, state.phase);
      } catch {
        // Session may already be dead
      }

      // Remove worktree
      const wt = state.worktrees.get(agentName);
      if (wt) {
        try {
          await removeWorktree(this.projectRoot, wt.worktreePath, wt.branchName);
        } catch {
          // Worktree may already be removed
        }
      }

      // Mark result
      const result = state.results.get(agentName);
      if (result && result.status === 'running') {
        result.status = 'cancelled';
        result.duration_ms = Date.now() - state.startedAt;
      }
    }

    this.activityService.log(
      state.taskId,
      'system',
      'note',
      `Bake-off ${bakeoffId} winner selected: ${winnerAgent}`,
      { bakeoff_id: bakeoffId, winner: winnerAgent },
    );
  }

  /**
   * Cancel a running bake-off: kill all sessions and clean up all worktrees.
   */
  async cancel(bakeoffId: string): Promise<void> {
    const state = this.bakeoffs.get(bakeoffId);
    if (!state) {
      throw new Error(`Bake-off ${bakeoffId} not found`);
    }

    state.cancelled = true;

    for (const agentName of state.agents) {
      // Kill TMUX session
      try {
        await this.tmuxManager.killAgent(state.taskId, agentName, state.phase);
      } catch {
        // Session may already be dead
      }

      // Remove worktree
      const wt = state.worktrees.get(agentName);
      if (wt) {
        try {
          await removeWorktree(this.projectRoot, wt.worktreePath, wt.branchName);
        } catch {
          // Worktree may already be removed
        }
      }

      // Mark result
      const result = state.results.get(agentName);
      if (result && result.status === 'running') {
        result.status = 'cancelled';
        result.duration_ms = Date.now() - state.startedAt;
      }
    }

    this.activityService.log(
      state.taskId,
      'system',
      'note',
      `Bake-off ${bakeoffId} cancelled`,
      { bakeoff_id: bakeoffId },
    );
  }

  /**
   * Get the count of active (non-cancelled, no-winner) bake-offs.
   */
  getActiveBakeoffCount(): number {
    let count = 0;
    for (const state of this.bakeoffs.values()) {
      if (!state.cancelled && !state.winner) {
        count++;
      }
    }
    return count;
  }
}
