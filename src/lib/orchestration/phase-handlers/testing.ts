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

export interface TestingResult {
  tmuxSession: string;
  promptFile?: string;
}

/**
 * Handle the testing phase for a task.
 *
 * Assembles the testing prompt and spawns the testing agent.
 */
export async function handleTesting(
  task: Task,
  agent: RoleConfig,
  adapter: CLIAdapter,
  _projectRoot: string,
  mark2Dir: string,
  apiBaseUrl: string,
  agentToken: string,
): Promise<TestingResult> {
  const db = getDb(mark2Dir);
  const now = new Date().toISOString();

  // Get the clone path for this task
  const cloneService = new CloneService(mark2Dir);
  const clonePath = cloneService.getClonePath(task.id);

  // Ensure clone exists
  if (!cloneService.cloneExists(task.id)) {
    await cloneService.createClone(task.id);
  }

  // Try to read the design document for context
  let designDocument: string | undefined;
  const designPath = `${clonePath}/design.md`;
  try {
    if (fs.existsSync(designPath)) {
      designDocument = fs.readFileSync(designPath, 'utf-8');
    }
  } catch {
    // Design doc may not exist
  }

  const promptContext: PromptContext = {
    designDocument,
  };

  // Assemble the prompts with split parts for CLI flags
  const assembler = new PromptAssembler(mark2Dir);
  const prompts = assembler.buildAgentAndTaskPrompts(task, agent, 'testing', promptContext);

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
    phase: 'testing',
    apiBaseUrl,
    agentToken,
    timeoutMinutes: agent.timeout_minutes,
  };

  const command = adapter.buildCommand(params);
  const env = adapter.getEnvironment(params);
  const promptFile = adapter.getPromptFilePath?.(params);

  // Spawn the agent
  const tmuxManager = new TmuxManager(mark2Dir);
  const tmuxSession = await tmuxManager.spawnAgent({
    taskId: task.id,
    agentName: agent.name,
    phase: 'testing',
    command,
    workingDir: clonePath,
    env,
  });

  // Log activity
  db.insert(activityEntries)
    .values({
      task_id: task.id,
      timestamp: now,
      source: 'orchestration',
      type: 'phase_change',
      message: `Testing phase started. Agent "${agent.name}" spawned in TMUX session "${tmuxSession}".`,
      metadata_json: JSON.stringify({
        agent: agent.name,
        tmux_session: tmuxSession,
      }),
    })
    .run();

  return { tmuxSession, promptFile };
}
