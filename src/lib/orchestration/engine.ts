import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { getDb } from '../db';
import { tasks, activityEntries } from '../db/schema';
import { eq } from 'drizzle-orm';
import { YamlReader } from '../yaml/reader';
import { YamlWriter } from '../yaml/writer';
import type { Task, Phase, RolesFile, Role, CLITool } from '../yaml/schemas';
import { isNewPhaseDefault, isLegacyPhaseDefault } from '../yaml/schemas';
import type { RoleConfig } from './phase-handlers/run-phase';
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
import { TmuxManager } from './tmux-manager';
import { sessionName as buildSessionName } from '../utils/tmux';
import { TerminalStream } from '../ws/terminal-stream';

import { handlePending } from './phase-handlers/pending';
import { handleDesign } from './phase-handlers/design';
import { handleCoding } from './phase-handlers/coding';
import { handleTesting } from './phase-handlers/testing';
import { handleCodeReview } from './phase-handlers/code-review';
import { handleFixReview } from './phase-handlers/fix-review';
import { handleFinalTesting } from './phase-handlers/final-testing';
import { handleRunTestPlan } from './phase-handlers/run-test-plan';
import { handleDone } from './phase-handlers/done';
import { ArtifactService } from '../services/artifact-service';
import { CloneService } from '../services/clone-service';
import { getTaskStoragePaths, ensureTaskStorageExistsSync, resolveArtifactPath, fileExistsSync } from '../utils/storage';

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
  private tmuxManager: TmuxManager;
  private terminalStream: TerminalStream;
  private adapters: Map<string, CLIAdapter>;
  private config: EngineConfig;
  private reader: YamlReader;
  private writer: YamlWriter;

  private constructor(config: EngineConfig) {
    this.config = config;
    this.tmuxManager = new TmuxManager(config.mark2Dir);
    this.terminalStream = TerminalStream.getInstance();
    // Use the .state directory for reading/writing task YAML files
    const stateDir = path.join(config.mark2Dir, '.state');
    this.reader = new YamlReader(stateDir);
    this.writer = new YamlWriter(stateDir);

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
    const tmuxName = buildSessionName(taskId, agentName, phase);

    // Idempotency check: verify the task is still in the expected phase
    // This prevents duplicate processing if both hook and watcher fire
    const currentTask = this.getTask(taskId);
    if (currentTask && currentTask.phase !== phase) {
      console.log(`[engine] Ignoring end token "${token}" for ${taskId} - task already transitioned from ${phase} to ${currentTask.phase}`);
      return;
    }

    // Mark the current session as completed and stop streaming
    this.tmuxManager.markCompletedByPhase(taskId, phase);
    this.terminalStream.stop(taskId);

    // Resolve adapter + working directory for cleanup
    let cleanupAdapter: CLIAdapter | null = null;
    let cleanupWorkDir: string | null = null;
    try {
      const task = this.getTask(taskId);
      if (task) {
        const role = this.resolveAgent(task, phase);
        cleanupAdapter = this.getAdapterForTool(role.cli_tool);
        const cloneService = new CloneService(this.config.mark2Dir);
        cleanupWorkDir = cloneService.getClonePath(taskId);
      }
    } catch (err) {
      console.error(`[engine] Failed to resolve adapter for cleanup (${taskId}/${phase}):`, err);
    }

    try {
      // Log the end token detection
      db.insert(activityEntries)
      .values({
        task_id: taskId,
        timestamp: now,
        source: agentName,
        type: 'note',
        message: `End token detected: ${token}`,
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
          source: agentName,
          type: 'note',
          message: `Auto-advance disabled — no transition`,
          metadata_json: JSON.stringify({ token, phase, agent: agentName, auto_advance: false }),
        })
        .run();
      return;
    }

    // Capture and save diff for coding phase (before any early returns)
    if (phase === 'coding' && token === '[CODING_COMPLETED]') {
      try {
        const diff = await this.captureAndSaveDiff(taskId, phase);
        if (diff) {
          db.insert(activityEntries)
            .values({
              task_id: taskId,
              timestamp: now,
              source: agentName,
              type: 'artifact',
              message: `Code diff saved (${diff.split('\n').length} lines)`,
            })
            .run();
        }
      } catch (err) {
        console.error(`[engine] Failed to capture diff for ${taskId}:`, err);
      }
    }

    if (!task.auto_approve) {
      db.insert(activityEntries)
        .values({
          task_id: taskId,
          timestamp: now,
          source: agentName,
          type: 'phase_change',
          message: `Phase complete — awaiting approval`,
          metadata_json: JSON.stringify({ token, phase, agent: agentName, auto_approve: false }),
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
    let loopContext: { testFailures?: string; reviewComments?: string; isReReview?: boolean } | undefined;

    if (token === '[TESTING_FAILED]' && nextPhase === 'coding') {
      // Capture test failure output from the TMUX session
      const { capturePane } = await import('../utils/tmux');
      const output = await capturePane(tmuxName, 200);
      loopContext = { testFailures: output };
    }

    if (token === '[REVIEW_COMPLETED]:autofix' && nextPhase === 'coding') {
      // Read review comments from the review.md artifact (legacy flow)
      // Try storage location first (new structure), then fallback to worktree (legacy)
      const storagePath = resolveArtifactPath(this.config.projectRoot, taskId, 'review.md');
      const worktreePath = path.join(
        this.config.projectRoot,
        '.worktrees',
        taskId,
        'design',
        'review.md',
      );

      try {
        if (fileExistsSync(storagePath)) {
          loopContext = { reviewComments: fs.readFileSync(storagePath, 'utf-8') };
        } else if (fs.existsSync(worktreePath)) {
          loopContext = { reviewComments: fs.readFileSync(worktreePath, 'utf-8') };
        }
      } catch {
        // Best-effort
      }
    }

    // New flow: code_review -> fix_review (review found issues)
    if (token === '[REVIEW_NEEDS_FIXES]' && nextPhase === 'fix_review') {
      const artifactService = new ArtifactService(this.config.mark2Dir);
      const { content } = artifactService.getMostRecentContent(taskId, 'review');
      if (content) {
        loopContext = { reviewComments: content };
      }
    }

    // New flow: final_testing -> fix_review (tests failed after review approval)
    if (token === '[FINAL_TESTING_FAILED]' && nextPhase === 'fix_review') {
      const { capturePane } = await import('../utils/tmux');
      const output = await capturePane(tmuxName, 200);
      loopContext = { testFailures: output };
    }

    // New flow: run_test_plan -> fix_review (manual tests failed)
    if (token === '[RUN_TEST_PLAN_FAILED]' && nextPhase === 'fix_review') {
      const artifactService = new ArtifactService(this.config.mark2Dir);
      // Get review comments (historical context)
      const { content: reviewComments } = artifactService.getMostRecentContent(taskId, 'review');
      // Get test execution report (what to focus on)
      const { content: testExecutionReport } = artifactService.getMostRecentContent(taskId, 'test-execution-report');
      loopContext = {
        reviewComments: reviewComments || undefined,
        testFailures: testExecutionReport || undefined,
      };
    }

    // New flow: fix_review -> code_review (re-review after fixes)
    if (token === '[FIX_REVIEW_COMPLETED]' && nextPhase === 'code_review') {
      loopContext = { isReReview: true };
    }

      // Update task phase
      this.updateTaskPhase(taskId, nextPhase);

      // Start the next phase
      await this.startPhase(taskId, nextPhase, loopContext);
    } finally {
      // Best-effort adapter cleanup
      if (cleanupAdapter?.cleanup && cleanupWorkDir) {
        try {
          await cleanupAdapter.cleanup(cleanupWorkDir);
        } catch (err) {
          console.error(`[engine] Adapter cleanup failed for ${taskId}/${phase}:`, err);
        }
      }
    }
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
      isReReview?: boolean;
    },
  ): Promise<void> {
    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const { projectRoot, mark2Dir, apiBaseUrl, agentToken } = this.config;

    // Handle terminal/non-agent phases before resolving role config
    if (phase === 'pending') {
      const result = await handlePending(task, mark2Dir);
      if (result.canAdvance) {
        this.updateTaskPhase(taskId, 'design');
        await this.startPhase(taskId, 'design');
      }
      return;
    }

    if (phase === 'done') {
      await handleDone(task, projectRoot, mark2Dir);
      return;
    }

    const role = this.resolveAgent(task, phase);
    // RoleConfig already has the right shape for phase handlers
    const adapter = this.getAdapterForTool(role.cli_tool);

    let tmuxSession: string | undefined;
    let promptFile: string | undefined;

    switch (phase) {

      case 'design': {
        const result = await handleDesign(
          task, role, adapter, projectRoot, mark2Dir, apiBaseUrl, agentToken, loopContext,
        );
        tmuxSession = result.tmuxSession;
        promptFile = result.promptFile;
        break;
      }

      case 'coding': {
        const result = await handleCoding(
          task, role, adapter, projectRoot, mark2Dir, apiBaseUrl, agentToken, loopContext,
        );
        tmuxSession = result.tmuxSession;
        promptFile = result.promptFile;
        break;
      }

      case 'testing': {
        const result = await handleTesting(
          task, role, adapter, projectRoot, mark2Dir, apiBaseUrl, agentToken,
        );
        tmuxSession = result.tmuxSession;
        promptFile = result.promptFile;
        break;
      }

      case 'code_review': {
        const result = await handleCodeReview(
          task, role, adapter, projectRoot, mark2Dir, apiBaseUrl, agentToken,
        );
        tmuxSession = result.tmuxSession;
        promptFile = result.promptFile;
        break;
      }

      case 'fix_review': {
        const result = await handleFixReview(
          task, role, adapter, projectRoot, mark2Dir, apiBaseUrl, agentToken, loopContext,
        );
        tmuxSession = result.tmuxSession;
        promptFile = result.promptFile;
        break;
      }

      case 'final_testing': {
        const result = await handleFinalTesting(
          task, role, adapter, projectRoot, mark2Dir, apiBaseUrl, agentToken,
        );
        tmuxSession = result.tmuxSession;
        promptFile = result.promptFile;
        break;
      }

      case 'run_test_plan': {
        const result = await handleRunTestPlan(
          task, role, adapter, projectRoot, mark2Dir, apiBaseUrl, agentToken,
          this.config.basePort, this.config.portsPerTask,
        );
        tmuxSession = result.tmuxSession;
        promptFile = result.promptFile;
        break;
      }

    }

    // Start terminal streaming for the spawned session
    // End token detection is handled by Claude Code's Stop hook (no polling needed)
    if (tmuxSession) {
      this.terminalStream.start(taskId, tmuxSession);
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
    this.tmuxManager.markFailedByPhase(taskId, phase);

    // Stop terminal stream
    this.terminalStream.stop(taskId);

    // Log the crash
    db.insert(activityEntries)
      .values({
        task_id: taskId,
        timestamp: now,
        source: agentName,
        type: 'error',
        message: `Agent crashed — TMUX session no longer alive`,
        metadata_json: JSON.stringify({
          agent: agentName,
          phase,
          tmux_session: tmuxName,
        }),
      })
      .run();

    // Best-effort adapter cleanup
    try {
      const task = this.getTask(taskId);
      if (task) {
        const role = this.resolveAgent(task, phase);
        const adapter = this.getAdapterForTool(role.cli_tool);
        if (adapter.cleanup) {
          const cloneService = new CloneService(this.config.mark2Dir);
          const workDir = cloneService.getClonePath(taskId);
          await adapter.cleanup(workDir);
        }
      }
    } catch (err) {
      console.error(`[engine] Adapter cleanup failed after crash for ${taskId}/${phase}:`, err);
    }
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

    // Re-attach terminal streaming for sessions still running
    // End token detection is handled by Claude Code's Stop hook
    const activeSessions = this.tmuxManager.getActiveSessions();
    let reattached = 0;

    for (const session of activeSessions) {
      this.terminalStream.start(session.task_id, session.tmux_session);
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
   * Gracefully shut down terminal streams.
   */
  shutdown(): void {
    this.terminalStream.stopAll();
  }

  /**
   * Cleanup all mark2 sessions (used for hard reset).
   */
  async cleanupAll(): Promise<number> {
    this.terminalStream.stopAll();
    return this.tmuxManager.cleanupSessions();
  }

  // ── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Capture git diff from a task's worktree and save it as an artifact.
   * Saves the diff to the storage directory, not the worktree.
   * Returns the diff content or null if no changes.
   */
  private async captureAndSaveDiff(
    taskId: string,
    phase: Phase,
  ): Promise<string | null> {
    const worktreePath = path.join(
      this.config.projectRoot,
      '.worktrees',
      taskId,
      phase,
    );

    if (!fs.existsSync(worktreePath)) {
      return null;
    }

    try {
      // Capture both staged and unstaged changes, plus untracked files
      let diff = '';

      // Get diff of tracked files (staged + unstaged)
      try {
        const trackedDiff = execSync('git diff HEAD', {
          cwd: worktreePath,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        });
        if (trackedDiff.trim()) {
          diff += trackedDiff;
        }
      } catch {
        // No HEAD or no tracked changes
      }

      // Get list of untracked files and their content
      try {
        const untrackedFiles = execSync('git ls-files --others --exclude-standard', {
          cwd: worktreePath,
          encoding: 'utf-8',
        }).trim();

        if (untrackedFiles) {
          const files = untrackedFiles.split('\n').filter(Boolean);
          for (const file of files) {
            const filePath = path.join(worktreePath, file);
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
              const content = fs.readFileSync(filePath, 'utf-8');
              diff += `\ndiff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n`;
              const lines = content.split('\n');
              diff += `@@ -0,0 +1,${lines.length} @@\n`;
              for (const line of lines) {
                diff += `+${line}\n`;
              }
            }
          }
        }
      } catch {
        // Failed to list untracked files
      }

      if (!diff.trim()) {
        return null;
      }

      // Ensure storage directories exist
      ensureTaskStorageExistsSync(this.config.projectRoot, taskId);

      // Save diff to storage directory (not worktree)
      const diffFileName = `${phase}-diff.patch`;
      const storagePaths = getTaskStoragePaths(this.config.projectRoot, taskId);
      const diffPath = path.join(storagePaths.artifacts, diffFileName);
      fs.writeFileSync(diffPath, diff);

      // Register as artifact
      const artifactService = new ArtifactService(this.config.mark2Dir);
      artifactService.report(taskId, {
        name: `${phase}-diff`,
        phase,
        path: diffFileName,
        mime_type: 'text/x-patch',
      });

      return diff;
    } catch (err) {
      console.error(`[engine] Failed to capture diff for ${taskId}:`, err);
      return null;
    }
  }

  private getTask(taskId: string): Task | null {
    const { data } = this.reader.readTask(taskId);
    return data;
  }

  /**
   * Resolve which role configuration to use for a given task and phase.
   *
   * Requires the new phase_defaults format with role, cli_tool, and model.
   * Uses roles.yaml to get role_prompt, applies task-level overrides.
   * Legacy agents.yaml is no longer supported.
   */
  private resolveAgent(task: Task, phase: Phase): RoleConfig {
    const configResult = this.reader.readConfig();
    const config = configResult.data;

    if (!config) {
      throw new Error('Config not found. Ensure .mark2/config.yaml exists.');
    }

    const phaseDefault = config.phase_defaults?.[phase];

    // Require the new format (has role, cli_tool, model)
    if (!phaseDefault || !isNewPhaseDefault(phaseDefault)) {
      throw new Error(
        `Phase "${phase}" requires role-based configuration. ` +
        `Add "${phase}" to phase_defaults in config.yaml with role, cli_tool, and model fields. ` +
        `Legacy agents.yaml format is no longer supported.`
      );
    }

    return this.resolveRoleConfiguration(task, phase, phaseDefault);
  }

  /**
   * Resolve role configuration using the decoupled role/cli/model format.
   */
  private resolveRoleConfiguration(
    task: Task,
    phase: Phase,
    phaseDefault: { role: string; cli_tool: CLITool; model: string; timeout_minutes?: number; auto_advance?: boolean }
  ): RoleConfig {
    // Read roles file
    const rolesResult = this.reader.readRoles();
    const rolesFile = rolesResult.data;

    if (!rolesFile || rolesFile.roles.length === 0) {
      throw new Error(
        'No roles defined. Create .mark2/roles.yaml with at least one role.',
      );
    }

    // Get the base role from phase default
    const baseRole = rolesFile.roles.find(r => r.name === phaseDefault.role);
    if (!baseRole) {
      throw new Error(`Role "${phaseDefault.role}" not found in roles.yaml`);
    }

    // Apply task-level overrides
    const override = task.phase_overrides?.[phase] ?? {};

    // Resolve final role (if overridden at task level)
    let finalRole: Role = baseRole;
    if (override.role) {
      const overrideRole = rolesFile.roles.find(r => r.name === override.role);
      if (overrideRole) {
        finalRole = overrideRole;
      } else {
        console.warn(`[engine] Override role "${override.role}" not found, using default "${baseRole.name}"`);
      }
    }

    // Build resolved role configuration
    return {
      name: finalRole.name,
      uuid: finalRole.uuid,
      role_prompt: finalRole.role_prompt,
      cli_tool: override.cli_tool ?? phaseDefault.cli_tool,
      model: override.model ?? phaseDefault.model,
      timeout_minutes: override.timeout_minutes ?? phaseDefault.timeout_minutes ?? finalRole.timeout_minutes,
    };
  }


  /**
   * Update task phase in both YAML and DB.
   */
  private updateTaskPhase(taskId: string, newPhase: Phase): void {
    const now = new Date().toISOString();

    // Update YAML
    const { data: task } = this.reader.readTask(taskId);
    if (task) {
      // Increment loop count when looping back for fixes
      const shouldIncrementLoop =
        // Legacy: coding from testing/code_review
        (newPhase === 'coding' && (task.phase === 'testing' || task.phase === 'code_review')) ||
        // New: fix_review from code_review, final_testing, or run_test_plan
        (newPhase === 'fix_review' && (task.phase === 'code_review' || task.phase === 'final_testing' || task.phase === 'run_test_plan'));

      const updatedTask: Task = {
        ...task,
        phase: newPhase,
        phase_entered_at: now,
        updated_at: now,
        loop_count: shouldIncrementLoop ? task.loop_count + 1 : task.loop_count,
      };
      this.writer.writeTask(updatedTask);
    }

    // Update DB
    const db = getDb(this.config.mark2Dir);
    const taskRow = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
    if (taskRow) {
      const currentLoopCount = taskRow.loop_count ?? 0;
      // Increment loop count when looping back for fixes
      const shouldIncrementLoop =
        // Legacy: coding from testing/code_review
        (newPhase === 'coding' && (taskRow.phase === 'testing' || taskRow.phase === 'code_review')) ||
        // New: fix_review from code_review, final_testing, or run_test_plan
        (newPhase === 'fix_review' && (taskRow.phase === 'code_review' || taskRow.phase === 'final_testing' || taskRow.phase === 'run_test_plan'));

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
