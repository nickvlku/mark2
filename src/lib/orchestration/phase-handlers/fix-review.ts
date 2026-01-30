import type { Task, AgentDefinition } from '../../yaml/schemas';
import { CloneService } from '../../services/clone-service';
import { ArtifactService } from '../../services/artifact-service';
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

  // Read the most recent design document from artifacts
  const artifactService = new ArtifactService(mark2Dir);
  const { content: designDocument } = artifactService.getMostRecentContent(task.id, 'design');

  // If no review comments in loopContext, try to get from artifacts
  let reviewComments = loopContext?.reviewComments;
  if (!reviewComments) {
    const { content } = artifactService.getMostRecentContent(task.id, 'review');
    reviewComments = content || undefined;
  }

  // If coming from final_testing failure, get test failures
  let testFailures = loopContext?.testFailures;
  if (!testFailures) {
    const { content } = artifactService.getMostRecentContent(task.id, 'test');
    // Only include if this looks like a failure (check for failure indicators)
    if (content && (content.includes('FAIL') || content.includes('Error') || content.includes('failed'))) {
      testFailures = content;
    }
  }

  const promptContext: PromptContext = {
    designDocument: designDocument || undefined,
    reviewComments,
    testFailures,
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
  const hasReviewComments = !!reviewComments;
  const hasTestFailures = !!testFailures;
  db.insert(activityEntries)
    .values({
      task_id: task.id,
      timestamp: now,
      source: agent.name,
      type: 'phase_change',
      message: `Fix review phase started to address ${hasTestFailures ? 'test failures' : 'code review feedback'}`,
      metadata_json: JSON.stringify({
        agent: agent.name,
        tmux_session: tmuxSession,
        phase: 'fix_review',
        has_review_comments: hasReviewComments,
        has_test_failures: hasTestFailures,
        loop_count: task.loop_count,
      }),
    })
    .run();

  return { tmuxSession, promptFile };
}
