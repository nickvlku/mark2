import fs from 'fs';
import path from 'path';
import { getDb } from '../db';
import { tasks, activityEntries } from '../db/schema';
import { eq } from 'drizzle-orm';
import { YamlReader } from '../yaml/reader';
import { YamlWriter } from '../yaml/writer';
import type { Task, AgentDefinition, Phase } from '../yaml/schemas';
import type { AgentsFile } from '../yaml/schemas';
import type { CLIAdapter } from '../adapters/types';

import { ClaudeCodeAdapter } from '../adapters/claude-code';
import { CodexCLIAdapter } from '../adapters/codex-cli';
import { GeminiCLIAdapter } from '../adapters/gemini-cli';
import { OpenCodeAdapter } from '../adapters/opencode';

import {
  PHASE_ORDER,
  findTransitionByTrigger,
  isValidTransition,
} from './pipeline';
import { EndTokenWatcher, type EndTokenMatch } from './end-token-watcher';
import { TmuxManager } from './tmux-manager';
import { sessionName as buildSessionName } from '../utils/tmux';

import { handlePending } from './phase-handlers/pending';
import { handleDesign } from './phase-handlers/design';
import { handleCoding } from './phase-handlers/coding';
import { handleTesting } from './phase-handlers/testing';
import { handleCodeReview } from './phase-handlers/code-review';
import { handleManualTesting } from './phase-handlers/manual-testing';
import { handleDone } from './phase-handlers/done';

// ── Types ───────────────────────────────────────────────────────────────────

export interface EngineConfig {
  projectRoot: string;
  mark2Dir: string;
  apiBaseUrl: string;
  agentToken: string;
  basePort?: number;
  portsPerTask?: number;
  maxLoopCount?: number;
}

// ── Orchestration Engine ────────────────────────────────────────────────────

let instance: OrchestrationEngine | null = null;

export class OrchestrationEngine {
  private watcher: EndTokenWatcher;
  private tmuxManager: TmuxManager;
  private adapters: Map<string, CLIAdapter>;
  private config: EngineConfig;
  private reader: YamlReader;
  private writer: YamlWriter;

  private constructor(config: EngineConfig) {
    this.config = config;
    this.watcher = new EndTokenWatcher();
    this.tmuxManager = new TmuxManager(config.mark2Dir);
    this.reader = new YamlReader(config.mark2Dir);
    this.writer = new YamlWriter(config.mark2Dir);

    // Register adapters
    this.adapters = new Map();
    const adapters: CLIAdapter[] = [
      new ClaudeCodeAdapter(),
      new CodexCLIAdapter(),
      new GeminiCLIAdapter(),
      new OpenCodeAdapter(),
    ];
    for (const adapter of adapters) {
      this.adapters.set(adapter.toolId, adapter);
    }
  }

  /**
   * Get or create the singleton engine instance.
   */
  static getInstance(config: EngineConfig): OrchestrationEngine {
    if (!instance) {
      instance = new OrchestrationEngine(config);
    }
    return instance;
  }

  /**
   * Reset the singleton (primarily for testing).
   */
  static resetInstance(): void {
    if (instance) {
      instance.shutdown();
      instance = null;
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Process an end token that was detected in an agent's TMUX output.
   * Determines the appropriate transition and executes it.
   */
  async processEndToken(
    taskId: string,
    agentName: string,
    phase: Phase,
    token: string,
  ): Promise<void> {
    const db = getDb(this.config.mark2Dir);
    const now = new Date().toISOString();

    // Mark the current session as completed
    const tmuxName = buildSessionName(taskId, agentName, phase);
    this.tmuxManager.markCompleted(tmuxName);

    // Log the end token detection
    db.insert(activityEntries)
      .values({
        task_id: taskId,
        timestamp: now,
        source: 'orchestration',
        type: 'note',
        message: `End token detected: ${token} (phase: ${phase}, agent: ${agentName})`,
        metadata_json: JSON.stringify({ token, phase, agent: agentName }),
      })
      .run();

    // Check if auto_advance is disabled for this task
    const task = this.getTask(taskId);
    if (!task) {
      db.insert(activityEntries)
        .values({
          task_id: taskId,
          timestamp: now,
          source: 'orchestration',
          type: 'error',
          message: `Task ${taskId} not found when processing end token.`,
        })
        .run();
      return;
    }

    if (!task.auto_advance) {
      db.insert(activityEntries)
        .values({
          task_id: taskId,
          timestamp: now,
          source: 'orchestration',
          type: 'note',
          message: `Auto-advance disabled for task. End token "${token}" detected but no transition will occur.`,
          metadata_json: JSON.stringify({ token, phase, agent: agentName, auto_advance: false }),
        })
        .run();
      return;
    }

    // Determine the transition
    const transition = findTransitionByTrigger(phase, token);
    if (!transition) {
      db.insert(activityEntries)
        .values({
          task_id: taskId,
          timestamp: now,
          source: 'orchestration',
          type: 'error',
          message: `No valid transition found for token "${token}" in phase "${phase}".`,
        })
        .run();
      return;
    }

    const nextPhase = transition.to;

    // Handle special loop-back cases
    let loopContext: { testFailures?: string; reviewComments?: string } | undefined;

    if (token === '[TESTING_FAILED]' && nextPhase === 'coding') {
      // Capture test failure output from the TMUX session
      const { capturePane } = await import('../utils/tmux');
      const output = await capturePane(tmuxName, 200);
      loopContext = { testFailures: output };
    }

    if (token === '[REVIEW_COMPLETED]:autofix' && nextPhase === 'coding') {
      // Read review comments from the review.md artifact
      const worktreePath = path.join(
        this.config.projectRoot,
        '.worktrees',
        taskId,
        'design',
      );
      const reviewPath = path.join(worktreePath, 'review.md');
      try {
        if (fs.existsSync(reviewPath)) {
          loopContext = { reviewComments: fs.readFileSync(reviewPath, 'utf-8') };
        }
      } catch {
        // Best-effort
      }
    }

    // Update task phase
    this.updateTaskPhase(taskId, nextPhase);

    // Start the next phase
    await this.startPhase(taskId, nextPhase, loopContext);
  }

  /**
   * Start a specific phase for a task. Dispatches to the appropriate handler
   * and sets up the end token watcher.
   */
  async startPhase(
    taskId: string,
    phase: Phase,
    loopContext?: {
      testFailures?: string;
      reviewComments?: string;
      humanComments?: string;
    },
  ): Promise<void> {
    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const agent = this.resolveAgent(task, phase);
    const adapter = this.getAdapterForTool(agent.cli_tool);
    const { projectRoot, mark2Dir, apiBaseUrl, agentToken } = this.config;

    let tmuxSession: string | undefined;

    switch (phase) {
      case 'pending': {
        const result = await handlePending(task, mark2Dir);
        if (result.canAdvance) {
          this.updateTaskPhase(taskId, 'design');
          await this.startPhase(taskId, 'design');
        }
        return; // No watcher needed for pending
      }

      case 'design': {
        const result = await handleDesign(
          task, agent, adapter, projectRoot, mark2Dir, apiBaseUrl, agentToken,
        );
        tmuxSession = result.tmuxSession;
        break;
      }

      case 'coding': {
        const result = await handleCoding(
          task, agent, adapter, projectRoot, mark2Dir, apiBaseUrl, agentToken, loopContext,
        );
        tmuxSession = result.tmuxSession;
        break;
      }

      case 'testing': {
        const result = await handleTesting(
          task, agent, adapter, projectRoot, mark2Dir, apiBaseUrl, agentToken,
        );
        tmuxSession = result.tmuxSession;
        break;
      }

      case 'code_review': {
        const result = await handleCodeReview(
          task, agent, adapter, projectRoot, mark2Dir, apiBaseUrl, agentToken,
        );
        tmuxSession = result.tmuxSession;
        break;
      }

      case 'manual_testing': {
        const result = await handleManualTesting(
          task, agent, adapter, projectRoot, mark2Dir, apiBaseUrl, agentToken,
          this.config.basePort, this.config.portsPerTask,
        );
        tmuxSession = result.tmuxSession;
        break;
      }

      case 'done': {
        await handleDone(task, projectRoot, mark2Dir);
        return; // No watcher needed for done
      }
    }

    // Set up end token watcher for the spawned session
    if (tmuxSession) {
      await this.watcher.watch(tmuxSession, phase, async (match: EndTokenMatch) => {
        await this.processEndToken(taskId, agent.name, phase, match.token);
      });
    }
  }

  /**
   * Handle an agent crash (session died without emitting an end token).
   */
  async handleAgentCrash(taskId: string, agentName: string, phase: Phase): Promise<void> {
    const db = getDb(this.config.mark2Dir);
    const now = new Date().toISOString();
    const tmuxName = buildSessionName(taskId, agentName, phase);

    // Mark session as failed
    this.tmuxManager.markFailed(tmuxName);

    // Stop the watcher if still active
    this.watcher.stop(tmuxName);

    // Log the crash
    db.insert(activityEntries)
      .values({
        task_id: taskId,
        timestamp: now,
        source: 'orchestration',
        type: 'error',
        message: `Agent "${agentName}" crashed during phase "${phase}". TMUX session "${tmuxName}" is no longer alive.`,
        metadata_json: JSON.stringify({
          agent: agentName,
          phase,
          tmux_session: tmuxName,
        }),
      })
      .run();
  }

  /**
   * Recover from a restart: scan for orphaned TMUX sessions, reconcile DB
   * state, and re-attach watchers for running sessions.
   */
  async recoverOnStartup(): Promise<{
    orphaned: number;
    reattached: number;
  }> {
    // Reconcile DB with actual TMUX state
    const orphaned = await this.tmuxManager.reconcile();

    // Log orphaned sessions
    const db = getDb(this.config.mark2Dir);
    const now = new Date().toISOString();

    for (const session of orphaned) {
      db.insert(activityEntries)
        .values({
          task_id: session.task_id,
          timestamp: now,
          source: 'orchestration',
          type: 'error',
          message: `Orphaned session detected on startup: "${session.tmux_session}" (phase: ${session.phase}). Marked as failed.`,
        })
        .run();
    }

    // Re-attach watchers for sessions still running
    const activeSessions = this.tmuxManager.getActiveSessions();
    let reattached = 0;

    for (const session of activeSessions) {
      const phase = session.phase as Phase;
      await this.watcher.watch(session.tmux_session, phase, async (match: EndTokenMatch) => {
        await this.processEndToken(
          session.task_id,
          session.agent_name,
          phase,
          match.token,
        );
      });
      reattached++;
    }

    return { orphaned: orphaned.length, reattached };
  }

  /**
   * Return the appropriate CLIAdapter for a given tool ID.
   */
  getAdapterForTool(toolId: string): CLIAdapter {
    const adapter = this.adapters.get(toolId);
    if (!adapter) {
      throw new Error(`No adapter registered for tool "${toolId}". Available: ${[...this.adapters.keys()].join(', ')}`);
    }
    return adapter;
  }

  /**
   * Gracefully shut down all watchers and sessions.
   */
  shutdown(): void {
    this.watcher.stopAll();
  }

  /**
   * Cleanup all mark2 sessions (used for hard reset).
   */
  async cleanupAll(): Promise<number> {
    this.watcher.stopAll();
    return this.tmuxManager.cleanup();
  }

  // ── Private Helpers ─────────────────────────────────────────────────────

  private getTask(taskId: string): Task | null {
    const { data } = this.reader.readTask(taskId);
    return data;
  }

  /**
   * Resolve which agent to use for a given task and phase.
   * Checks assigned_agents first, then falls back to phase_defaults in config,
   * then falls back to the first agent defined.
   */
  private resolveAgent(task: Task, phase: Phase): AgentDefinition {
    // Read agents file
    const agentsPath = path.join(this.config.mark2Dir, 'agents.yaml');
    let agentsFile: AgentsFile | null = null;

    try {
      if (fs.existsSync(agentsPath)) {
        const YAML = require('yaml');
        const raw = fs.readFileSync(agentsPath, 'utf-8');
        const parsed = YAML.parse(raw);
        const { AgentsFileSchema } = require('../yaml/schemas');
        const result = AgentsFileSchema.safeParse(parsed);
        if (result.success) {
          agentsFile = result.data;
        }
      }
    } catch {
      // Fall through
    }

    if (!agentsFile || agentsFile.agents.length === 0) {
      throw new Error(
        'No agents defined. Create .mark2/agents.yaml with at least one agent.',
      );
    }

    // Check if the task has assigned agents
    if (task.assigned_agents.length > 0) {
      const agentName = task.assigned_agents[0];
      const agent = agentsFile.agents.find((a) => a.name === agentName);
      if (agent) return agent;
    }

    // Check phase defaults in config
    const configResult = this.reader.readConfig();
    if (configResult.data?.phase_defaults) {
      const phaseConfig = configResult.data.phase_defaults[phase];
      if (phaseConfig?.default_agent) {
        const agent = agentsFile.agents.find(
          (a) => a.name === phaseConfig.default_agent,
        );
        if (agent) return agent;
      }
    }

    // Fall back to first agent
    return agentsFile.agents[0];
  }

  /**
   * Update task phase in both YAML and DB.
   */
  private updateTaskPhase(taskId: string, newPhase: Phase): void {
    const now = new Date().toISOString();

    // Update YAML
    const { data: task } = this.reader.readTask(taskId);
    if (task) {
      const updatedTask: Task = {
        ...task,
        phase: newPhase,
        phase_entered_at: now,
        updated_at: now,
        loop_count: newPhase === 'coding' && task.phase === 'testing'
          ? task.loop_count + 1
          : newPhase === 'coding' && task.phase === 'code_review'
            ? task.loop_count + 1
            : task.loop_count,
      };
      this.writer.writeTask(updatedTask);
    }

    // Update DB
    const db = getDb(this.config.mark2Dir);
    const taskRow = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
    if (taskRow) {
      const currentLoopCount = taskRow.loop_count ?? 0;
      const shouldIncrementLoop =
        newPhase === 'coding' &&
        (taskRow.phase === 'testing' || taskRow.phase === 'code_review');

      db.update(tasks)
        .set({
          phase: newPhase,
          phase_entered_at: now,
          updated_at: now,
          loop_count: shouldIncrementLoop
            ? currentLoopCount + 1
            : currentLoopCount,
        })
        .where(eq(tasks.id, taskId))
        .run();
    }

    // Log phase transition
    db.insert(activityEntries)
      .values({
        task_id: taskId,
        timestamp: now,
        source: 'orchestration',
        type: 'phase_change',
        message: `Phase transition: ${taskRow?.phase ?? '?'} -> ${newPhase}`,
        metadata_json: JSON.stringify({
          from: taskRow?.phase,
          to: newPhase,
        }),
      })
      .run();
  }
}
