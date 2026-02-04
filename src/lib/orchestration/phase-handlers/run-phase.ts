import type { Task, Phase } from '../../yaml/schemas';
import type { CLIAdapter } from '../../adapters/types';
import type { AgentInvocationParams } from '../../../types';
import type { PromptContext } from '../prompt-assembler';
import { CloneService } from '../../services/clone-service';
import { getDb } from '../../db';
import { activityEntries } from '../../db/schema';
import { TmuxManager } from '../tmux-manager';
import { PromptAssembler } from '../prompt-assembler';

/** Role configuration used by phase handlers (resolved from role + phase defaults + overrides). */
export interface RoleConfig {
  name: string;
  uuid?: string;
  cli_tool: string;
  model: string;
  role_prompt: string;
  timeout_minutes: number;
}

export interface RunPhaseContext<TExtra = Record<string, never>> {
  task: Task;
  role: RoleConfig;
  phase: Phase;
  clonePath: string;
  tmuxSession: string;
  now: string;
  /** Set when createCloneFirst is true. */
  branchName?: string;
  /** Optional context passed to getPromptContext (e.g. loopContext). */
  phaseContext?: unknown;
  /** Result from preHook when provided. */
  extra?: TExtra;
}

export interface RunPhaseOptions<TExtra = Record<string, never>> {
  /** When true, create clone via CloneService.createClone(); otherwise get path and ensure clone exists. */
  createCloneFirst?: boolean;
  /** Optional context for prompt building (e.g. loopContext for design/coding/fix_review). */
  phaseContext?: unknown;
  /** Build prompt context for this phase (can be async). Receives clonePath, task, and optional phaseContext. */
  getPromptContext: (
    clonePath: string,
    task: Task,
    phaseContext?: unknown,
  ) => PromptContext | Promise<PromptContext> | undefined;
  /** Activity log message (or function of context). */
  activityMessage: string | ((ctx: RunPhaseContext<TExtra>) => string);
  /** Optional activity metadata (or function of context). */
  activityMetadata?:
    | Record<string, unknown>
    | ((ctx: RunPhaseContext<TExtra>) => Record<string, unknown>);
  /** Source for activity entry (default: 'orchestration'). Can be a function of context. */
  activitySource?: string | ((ctx: RunPhaseContext<TExtra>) => string);
  /** Optional hook run before spawning (e.g. port allocation); return value is merged into result. */
  preHook?: (ctx: {
    mark2Dir: string;
    taskId: string;
    task: Task;
    now: string;
    db: ReturnType<typeof getDb>;
  }) => Promise<TExtra>;
}

const DEFAULT_ACTIVITY_SOURCE = 'orchestration';

/**
 * Shared logic for role-based phases: ensure clone, build prompt, spawn CLI tool, log activity.
 * Used by design, coding, testing, code_review, fix_review, final_testing, run_test_plan.
 */
export async function runPhase<TExtra = Record<string, never>>(
  task: Task,
  role: RoleConfig,
  adapter: CLIAdapter,
  mark2Dir: string,
  apiBaseUrl: string,
  agentToken: string,
  phase: Phase,
  options: RunPhaseOptions<TExtra>,
): Promise<{ tmuxSession: string; promptFile?: string; clonePath?: string; branchName?: string } & TExtra> {
  const db = getDb(mark2Dir);
  const now = new Date().toISOString();
  const cloneService = new CloneService(mark2Dir);

  let clonePath: string;
  let branchName: string | undefined;

  if (options.createCloneFirst) {
    const cloneInfo = await cloneService.createClone(task.id);
    clonePath = cloneInfo.clonePath;
    branchName = cloneInfo.branchName;
  } else {
    clonePath = cloneService.getClonePath(task.id);
    if (!cloneService.cloneExists(task.id)) {
      await cloneService.createClone(task.id);
    }
  }

  let extra: TExtra = {} as TExtra;
  if (options.preHook) {
    extra = await options.preHook({ mark2Dir, taskId: task.id, task, now, db });
  }

  const rawContext = await Promise.resolve(
    options.getPromptContext(clonePath, task, options.phaseContext),
  );
  const promptContext = rawContext ?? {};
  const assembler = new PromptAssembler(mark2Dir);
  const promptParts = assembler.buildAgentAndTaskPrompts(task, role as any, phase, promptContext);

  const params: AgentInvocationParams = {
    prompt: promptParts.taskPrompt,
    orchestrationPrompt: promptParts.orchestrationPrompt,
    agentPrompt: promptParts.agentPrompt,
    taskPrompt: promptParts.taskPrompt,
    agentSlug: promptParts.agentName,
    agentUuid: role.uuid,
    workingDirectory: clonePath,
    agentName: role.name,
    model: role.model,
    taskId: task.id,
    phase,
    apiBaseUrl,
    agentToken,
    timeoutMinutes: role.timeout_minutes,
  };

  const command = adapter.buildCommand(params);
  const env = adapter.getEnvironment(params);
  const promptFile = adapter.getPromptFilePath?.(params);

  const tmuxManager = new TmuxManager(mark2Dir);
  const tmuxSession = await tmuxManager.spawnAgent({
    taskId: task.id,
    agentName: role.name,
    phase,
    command,
    workingDir: clonePath,
    env,
  });

  const ctx: RunPhaseContext<TExtra> = {
    task,
    role,
    phase,
    clonePath,
    tmuxSession,
    now,
    branchName,
    phaseContext: options.phaseContext,
    extra,
  };
  const message =
    typeof options.activityMessage === 'function' ? options.activityMessage(ctx) : options.activityMessage;
  const metadata = options.activityMetadata
    ? typeof options.activityMetadata === 'function'
      ? options.activityMetadata(ctx)
      : options.activityMetadata
    : undefined;

  db.insert(activityEntries)
    .values({
      task_id: task.id,
      timestamp: now,
      source:
        typeof options.activitySource === 'function'
          ? options.activitySource(ctx)
          : (options.activitySource ?? DEFAULT_ACTIVITY_SOURCE),
      type: 'phase_change',
      message,
      metadata_json: metadata ? JSON.stringify(metadata) : undefined,
    })
    .run();

  const result: {
    tmuxSession: string;
    promptFile?: string;
    clonePath?: string;
    branchName?: string;
  } & TExtra = {
    tmuxSession,
    promptFile,
    ...extra,
  };
  if (options.createCloneFirst && branchName !== undefined) {
    result.clonePath = clonePath;
    result.branchName = branchName;
  }
  return result;
}
