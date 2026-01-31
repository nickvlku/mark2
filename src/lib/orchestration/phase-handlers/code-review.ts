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

export interface CodeReviewResult {
  tmuxSession: string;
  promptFile?: string;
}

/**
 * Handle the code review phase for a task.
 *
 * Assembles the review prompt including the full diff from origin/main,
 * then spawns the review role.
 */
export async function handleCodeReview(
  task: Task,
  role: RoleConfig,
  adapter: CLIAdapter,
  _projectRoot: string,
  mark2Dir: string,
  apiBaseUrl: string,
  agentToken: string,
): Promise<CodeReviewResult> {
  const db = getDb(mark2Dir);
  const now = new Date().toISOString();

  // Get the clone path for this task
  const cloneService = new CloneService(mark2Dir);
  const clonePath = cloneService.getClonePath(task.id);

  // Ensure clone exists
  if (!cloneService.cloneExists(task.id)) {
    await cloneService.createClone(task.id);
  }

  // Get the diff for review using CloneService
  let diff = '';
  try {
    const result = await cloneService.getDiff(task.id);
    diff = result.diff || '(No changes)';
  } catch {
    diff = '(Unable to generate diff)';
  }

  // Read the design document for context
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
    diff,
  };

  // Assemble the prompts with split parts for CLI flags
  const assembler = new PromptAssembler(mark2Dir);
  const prompts = assembler.buildAgentAndTaskPrompts(task, role, 'code_review', promptContext);

  // Build invocation params with split prompts
  const params: AgentInvocationParams = {
    prompt: prompts.taskPrompt,
    orchestrationPrompt: prompts.orchestrationPrompt,
    agentPrompt: prompts.agentPrompt,
    taskPrompt: prompts.taskPrompt,
    agentSlug: prompts.agentName,
    workingDirectory: clonePath,
    agentName: role.name,
    model: role.model,
    taskId: task.id,
    phase: 'code_review',
    apiBaseUrl,
    agentToken,
    timeoutMinutes: role.timeout_minutes,
  };

  const command = adapter.buildCommand(params);
  const env = adapter.getEnvironment(params);
  const promptFile = adapter.getPromptFilePath?.(params);

  // Spawn the agent
  const tmuxManager = new TmuxManager(mark2Dir);
  const tmuxSession = await tmuxManager.spawnAgent({
    taskId: task.id,
    agentName: role.name,
    phase: 'code_review',
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
      message: `Code review phase started. Role "${role.name}" spawned in TMUX session "${tmuxSession}".`,
      metadata_json: JSON.stringify({
        role: role.name,
        tmux_session: tmuxSession,
        diff_length: diff.length,
      }),
    })
    .run();

  return { tmuxSession, promptFile };
}
