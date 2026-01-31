import type { Task, AgentDefinition } from '../../yaml/schemas';
import { CloneService } from '../../services/clone-service';
import { getDb } from '../../db';
import { activityEntries } from '../../db/schema';
import { TmuxManager } from '../tmux-manager';
import { PromptAssembler, type PromptContext } from '../prompt-assembler';
import type { CLIAdapter } from '../../adapters/types';
import type { AgentInvocationParams } from '../../../types';

export interface FixReviewResult {
  tmuxSession: string;
  promptFile?: string;
}

/**
 * Handle the fix_review phase for a task.
 *
 * This phase is entered when code review finds issues that need fixing.
 * The agent receives the review feedback and makes targeted fixes.
 */
export async function handleFixReview(
  task: Task,
  agent: AgentDefinition,
  adapter: CLIAdapter,
  _projectRoot: string,
  mark2Dir: string,
  apiBaseUrl: string,
  agentToken: string,
  loopContext?: {
    reviewComments?: string;
    testFailures?: string;
  },
): Promise<FixReviewResult> {
  const db = getDb(mark2Dir);
  const now = new Date().toISOString();

  // Get the clone path for this task
  const cloneService = new CloneService(mark2Dir);
  const clonePath = cloneService.getClonePath(task.id);

  // Ensure clone exists
  if (!cloneService.cloneExists(task.id)) {
    await cloneService.createClone(task.id);
  }

  // Note: We don't embed review comments or test failures in the prompt
  // The agent will fetch them via MCP tools to avoid shell escaping issues with large content

  const promptContext: PromptContext = {
    // Don't include designDocument, reviewComments, or testFailures inline
    // Agent will use mark2_list_artifacts and mark2_get_artifact to fetch them
    loopCount: task.loop_count > 0 ? task.loop_count : undefined,
  };

  // Assemble the prompts (separated for Claude CLI flags)
  const assembler = new PromptAssembler(mark2Dir);
  const promptParts = assembler.buildAgentAndTaskPrompts(task, agent, 'fix_review', promptContext);

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
    phase: 'fix_review',
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
    phase: 'fix_review',
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
      message: `Fix review phase started. Agent will fetch review feedback and test results via MCP tools.`,
      metadata_json: JSON.stringify({
        agent: agent.name,
        tmux_session: tmuxSession,
        phase: 'fix_review',
        loop_count: task.loop_count,
      }),
    })
    .run();

  return { tmuxSession, promptFile };
}
