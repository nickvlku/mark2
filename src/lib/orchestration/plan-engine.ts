import path from 'path';
import fs from 'fs';
import { getDb } from '../db';
import { plans, activityEntries } from '../db/schema';
import { eq } from 'drizzle-orm';
import type { Plan, PlanPhase, Role, CLITool } from '../yaml/schemas';
import { isNewPhaseDefault } from '../yaml/schemas';
import type { RoleConfig } from './phase-handlers/run-phase';
import type { CLIAdapter } from '../adapters/types';
import type { AgentInvocationParams } from '../../types';

import { ClaudeCodeAdapter } from '../adapters/claude-code';
import { CodexCLIAdapter } from '../adapters/codex-cli';
import { GeminiCLIAdapter } from '../adapters/gemini-cli';
import { OpenCodeAdapter } from '../adapters/opencode';

import { YamlReader } from '../yaml/reader';
import { TmuxManager } from './tmux-manager';
import { TerminalStream } from '../ws/terminal-stream';
import { PlanPromptAssembler } from './plan-prompt-assembler';
import { PLAN_AGENT_PHASES, PLAN_PHASE_ROLES } from './plan-pipeline';
import { PlanService } from '../services/plan-service';
import { getMark2Dir } from '../utils/mark2-dir';

export interface PlanEngineConfig {
  projectRoot: string;
  mark2Dir: string;
  apiBaseUrl: string;
  agentToken: string;
}

/**
 * Lightweight orchestration engine for plan phases.
 * Simpler than OrchestrationEngine — no clones, worktrees, or loop counting.
 * Plans run agents in the project root (read-only analysis + document generation).
 */
export class PlanEngine {
  private config: PlanEngineConfig;
  private tmuxManager: TmuxManager;
  private terminalStream: TerminalStream;
  private adapters: Map<string, CLIAdapter>;
  private reader: YamlReader;
  private planService: PlanService;

  constructor(config: PlanEngineConfig) {
    this.config = config;
    this.tmuxManager = new TmuxManager(config.mark2Dir);
    this.terminalStream = TerminalStream.getInstance();
    const stateDir = path.join(config.mark2Dir, '.state');
    this.reader = new YamlReader(stateDir);
    this.planService = new PlanService(config.mark2Dir);

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
   * Start an agent phase for a plan (prd, tech_spec, or task_generation).
   */
  async startPhase(
    planId: string,
    phase: PlanPhase,
    feedback?: string,
  ): Promise<{ tmuxSession: string }> {
    if (!PLAN_AGENT_PHASES.includes(phase)) {
      throw new Error(`Phase "${phase}" is not an agent phase`);
    }

    const plan = this.planService.getById(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    const roleName = PLAN_PHASE_ROLES[phase];
    if (!roleName) {
      throw new Error(`No role configured for plan phase "${phase}"`);
    }

    // Resolve role and adapter
    const role = this.resolveRole(roleName, phase);
    const adapter = this.getAdapter(role.cli_tool);

    // Read prior artifacts for context
    const priorArtifacts = this.readPriorArtifacts(plan, phase);

    // Build prompts
    const assembler = new PlanPromptAssembler(this.config.mark2Dir);
    const prompts = assembler.buildPrompts(
      plan,
      role.role_prompt,
      role.name,
      phase,
      feedback,
      priorArtifacts,
    );

    // Build invocation params
    const params: AgentInvocationParams = {
      prompt: prompts.taskPrompt,
      orchestrationPrompt: prompts.orchestrationPrompt,
      agentPrompt: prompts.agentPrompt,
      taskPrompt: prompts.taskPrompt,
      agentSlug: prompts.agentName,
      agentUuid: role.uuid,
      workingDirectory: this.config.projectRoot,
      agentName: role.name,
      model: role.model,
      taskId: planId,
      phase: phase as any, // PlanPhase used as Phase for the adapter
      apiBaseUrl: this.config.apiBaseUrl,
      agentToken: this.config.agentToken,
      timeoutMinutes: role.timeout_minutes,
    };

    const command = adapter.buildCommand(params);
    const env = adapter.getEnvironment(params);

    // Spawn agent in tmux
    const tmuxSession = await this.tmuxManager.spawnAgent({
      taskId: planId,
      agentName: role.name,
      phase: phase as any,
      command,
      workingDir: this.config.projectRoot,
      env,
    });

    // Log activity
    const db = getDb(this.config.mark2Dir);
    const now = new Date().toISOString();
    db.insert(activityEntries).values({
      task_id: planId,
      timestamp: now,
      source: 'orchestration',
      type: 'phase_change',
      message: `Plan phase "${phase}" started. Agent "${role.name}" spawned in tmux session "${tmuxSession}".`,
      metadata_json: JSON.stringify({
        agent: role.name,
        tmux_session: tmuxSession,
        phase,
        feedback: feedback || null,
      }),
    }).run();

    // Start terminal streaming
    this.terminalStream.start(planId, tmuxSession);

    return { tmuxSession };
  }

  /**
   * Process an end token from a plan agent.
   */
  async processEndToken(
    planId: string,
    phase: PlanPhase,
    token: string,
  ): Promise<void> {
    const plan = this.planService.getById(planId);
    if (!plan) return;

    // Idempotency: check plan is still in expected phase
    if (plan.phase !== phase) {
      console.log(`[plan-engine] Ignoring token "${token}" for ${planId} - already transitioned from ${phase}`);
      return;
    }

    // Mark session as completed and stop streaming
    this.tmuxManager.markCompletedByPhase(planId, phase as any);
    this.terminalStream.stop(planId);

    // Log
    const db = getDb(this.config.mark2Dir);
    const now = new Date().toISOString();
    db.insert(activityEntries).values({
      task_id: planId,
      timestamp: now,
      source: 'orchestration',
      type: 'note',
      message: `End token detected: ${token}`,
      metadata_json: JSON.stringify({ token, phase }),
    }).run();
  }

  private resolveRole(roleName: string, phase?: PlanPhase): RoleConfig {
    // Read config for default CLI tool and model
    const configResult = this.reader.readConfig();
    const config = configResult.data;

    // Default to claude-code / sonnet if no config
    let cliTool = 'claude-code';
    let model = 'claude-sonnet-4-5';
    let timeoutMinutes = 60;

    // Try plan_phase_defaults first (phase-specific config for plans)
    if (phase && config?.plan_phase_defaults) {
      const planDefault = config.plan_phase_defaults[phase];
      if (planDefault) {
        cliTool = planDefault.cli_tool;
        model = planDefault.model;
        if (planDefault.timeout_minutes) {
          timeoutMinutes = planDefault.timeout_minutes;
        }
        // Also override roleName if configured
        roleName = planDefault.role;
      }
    } else if (config?.phase_defaults) {
      // Fallback to task phase_defaults (use design defaults as reasonable fallback)
      const designDefault = config.phase_defaults['design'];
      if (designDefault && isNewPhaseDefault(designDefault)) {
        cliTool = designDefault.cli_tool;
        model = designDefault.model;
        if (designDefault.timeout_minutes) {
          timeoutMinutes = designDefault.timeout_minutes;
        }
      }
    }

    // Read roles file
    const rolesResult = this.reader.readRoles();
    const rolesFile = rolesResult.data;

    if (rolesFile) {
      const role = rolesFile.roles.find(r => r.name === roleName);
      if (role) {
        return {
          name: role.name,
          uuid: role.uuid,
          role_prompt: role.role_prompt,
          cli_tool: cliTool,
          model,
          timeout_minutes: role.timeout_minutes || timeoutMinutes,
        };
      }
    }

    // Fallback: use a generic prompt if role not found
    return {
      name: roleName,
      role_prompt: `You are a ${roleName} agent. Complete your assigned task thoroughly and signal completion when done.`,
      cli_tool: cliTool,
      model,
      timeout_minutes: timeoutMinutes,
    };
  }

  private getAdapter(toolId: string): CLIAdapter {
    const adapter = this.adapters.get(toolId);
    if (!adapter) {
      throw new Error(`No adapter for tool "${toolId}"`);
    }
    return adapter;
  }

  private readPriorArtifacts(
    plan: Plan,
    phase: PlanPhase,
  ): { name: string; content: string }[] {
    const artifacts: { name: string; content: string }[] = [];
    const storageDir = path.join(this.config.mark2Dir, 'storage', plan.id, 'artifacts');

    if (phase === 'tech_spec' || phase === 'task_generation') {
      // Include PRD
      const prdPath = path.join(storageDir, 'prd.md');
      if (fs.existsSync(prdPath)) {
        artifacts.push({ name: 'PRD', content: fs.readFileSync(prdPath, 'utf-8') });
      }
    }

    if (phase === 'task_generation') {
      // Include tech spec
      const techSpecPath = path.join(storageDir, 'tech-spec.md');
      if (fs.existsSync(techSpecPath)) {
        artifacts.push({ name: 'Technical Specification', content: fs.readFileSync(techSpecPath, 'utf-8') });
      }
    }

    return artifacts;
  }
}
