import type { Task, AgentDefinition } from '../../yaml/schemas';
import { CloneService } from '../../services/clone-service';
import { ArtifactService } from '../../services/artifact-service';
import { getDb } from '../../db';
import { activityEntries } from '../../db/schema';
import { TmuxManager } from '../tmux-manager';
import { PromptAssembler, type PromptContext } from '../prompt-assembler';
import type { CLIAdapter } from '../../adapters/types';
import type { AgentInvocationParams } from '../../../types';

export interface FinalTestingResult {
  tmuxSession: string;
  promptFile?: string;
}

/**
 * Handle the final_testing phase for a task.
 *
 * This phase runs after code review approval to verify all tests still pass.
 * If tests fail, the task goes to fix_review instead of looping back to coding.
 */
export async function handleFinalTesting(
  task: Task,
  agent: AgentDefinition,
  adapter: CLIAdapter,
  _projectRoot: string,
  mark2Dir: string,
  apiBaseUrl: string,
  agentToken: string,
): Promise<FinalTestingResult> {
  const db = getDb(mark2Dir);
  const now = new Date().toISOString();

  // Get the clone path for this task
  const cloneService = new CloneService(mark2Dir);
  const clonePath = cloneService.getClonePath(task.id);

  // Ensure clone exists
  if (!cloneService.cloneExists(task.id)) {
    await cloneService.createClone(task.id);
  }

  // Read the most recent design document from artifacts
  const artifactService = new ArtifactService(mark2Dir);
  const { content } = artifactService.getMostRecentContent(task.id, 'design');
  const designDocument = content || undefined;

  const promptContext: PromptContext = {
    designDocument,
  };

  // Assemble the prompts (separated for Claude CLI flags)
  const assembler = new PromptAssembler(mark2Dir);
  const promptParts = assembler.buildAgentAndTaskPrompts(task, agent, 'final_testing', promptContext);

  // Build invocation params with separated prompts
  const params: AgentInvocationParams = {
    prompt: promptParts.taskPrompt, // Legacy fallback
    orchestrationPrompt: promptParts.orchestrationPrompt,
    agentPrompt: promptParts.agentPrompt,
    taskPrompt: promptParts.taskPrompt,
    agentSlug: promptParts.agentName,
    agentUuid: agent.uuid,
    workingDirectory: clonePath,
    agentName: agent.name,
    model: agent.model,
    taskId: task.id,
    phase: 'final_testing',
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
    phase: 'final_testing',
    command,
    workingDir: clonePath,
    env,
  });

  // Log activity
  db.insert(activityEntries)
    .values({
      task_id: task.id,
      timestamp: now,
      source: agent.name,
      type: 'phase_change',
      message: `Final testing phase started after code review approval`,
      metadata_json: JSON.stringify({
        agent: agent.name,
        tmux_session: tmuxSession,
        phase: 'final_testing',
      }),
    })
    .run();

  return { tmuxSession, promptFile };
}
