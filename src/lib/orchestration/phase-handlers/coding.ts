import fs from 'fs';
import type { Task } from '../../yaml/schemas';
import type { RoleConfig } from './run-phase';
import { CloneService } from '../../services/clone-service';
import { getDb } from '../../db';
import { activityEntries } from '../../db/schema';
import { TmuxManager } from '../tmux-manager';
import { PromptAssembler, type PromptContext } from '../prompt-assembler';
import type { CLIAdapter } from '../../adapters/types';
import type { AgentInvocationParams } from '../../../types';

export interface CodingResult {
  tmuxSession: string;
  promptFile?: string;
}

/**
 * Handle the coding phase for a task.
 *
 * Assembles the coding prompt (with optional loop-back context from test
 * failures or review comments) and spawns the coding agent.
 */
export async function handleCoding(
  task: Task,
  agent: RoleConfig,
  adapter: CLIAdapter,
  _projectRoot: string,
  mark2Dir: string,
  apiBaseUrl: string,
  agentToken: string,
  loopContext?: {
    testFailures?: string;
    reviewComments?: string;
    humanComments?: string;
  },
): Promise<CodingResult> {
  const db = getDb(mark2Dir);
  const now = new Date().toISOString();

  // Get the clone path for this task (should already exist from design phase)
  const cloneService = new CloneService(mark2Dir);
  const clonePath = cloneService.getClonePath(task.id);

  // Ensure clone exists, create if needed (shouldn't happen but just in case)
  if (!cloneService.cloneExists(task.id)) {
    await cloneService.createClone(task.id);
  }

  // Try to read the design document if it exists
  let designDocument: string | undefined;
  const designPath = `${clonePath}/design.md`;
  try {
    if (fs.existsSync(designPath)) {
      designDocument = fs.readFileSync(designPath, 'utf-8');
    }
  } catch {
    // Design doc may not exist yet
  }

  // Build prompt context
  const promptContext: PromptContext = {
    designDocument,
    testFailures: loopContext?.testFailures,
    reviewComments: loopContext?.reviewComments,
    humanComments: loopContext?.humanComments,
    loopCount: task.loop_count > 0 ? task.loop_count : undefined,
  };

  // Assemble the prompts with split parts for CLI flags
  const assembler = new PromptAssembler(mark2Dir);
  const prompts = assembler.buildAgentAndTaskPrompts(task, agent, 'coding', promptContext);

  // Build invocation params with split prompts
  const params: AgentInvocationParams = {
    prompt: prompts.taskPrompt,
    orchestrationPrompt: prompts.orchestrationPrompt,
    agentPrompt: prompts.agentPrompt,
    taskPrompt: prompts.taskPrompt,
    agentSlug: prompts.agentName,
    workingDirectory: clonePath,
    agentName: agent.name,
    model: agent.model,
    taskId: task.id,
    phase: 'coding',
    apiBaseUrl,
    agentToken,
    timeoutMinutes: agent.timeout_minutes,
  };

  // Build command and environment
  const command = adapter.buildCommand(params);
  const env = adapter.getEnvironment(params);
  const promptFile = adapter.getPromptFilePath?.(params);

  // Spawn the agent
  const tmuxManager = new TmuxManager(mark2Dir);
  const tmuxSession = await tmuxManager.spawnAgent({
    taskId: task.id,
    agentName: agent.name,
    phase: 'coding',
    command,
    workingDir: clonePath,
    env,
  });

  // Log activity
  const isLoop = task.loop_count > 0;
  db.insert(activityEntries)
    .values({
      task_id: task.id,
      timestamp: now,
      source: 'orchestration',
      type: 'phase_change',
      message: isLoop
        ? `Coding phase restarted (loop #${task.loop_count}). Agent "${agent.name}" spawned.`
        : `Coding phase started. Agent "${agent.name}" spawned in TMUX session "${tmuxSession}".`,
      metadata_json: JSON.stringify({
        agent: agent.name,
        tmux_session: tmuxSession,
        loop_count: task.loop_count,
        has_test_failures: !!loopContext?.testFailures,
        has_review_comments: !!loopContext?.reviewComments,
        has_human_comments: !!loopContext?.humanComments,
      }),
    })
    .run();

  return { tmuxSession, promptFile };
}
