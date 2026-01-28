import path from 'path';
import fs from 'fs';
import type { Task, AgentDefinition } from '../../yaml/schemas';
import { getDiff } from '../../utils/git';
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
 * then spawns the review agent.
 */
export async function handleCodeReview(
  task: Task,
  agent: AgentDefinition,
  adapter: CLIAdapter,
  projectRoot: string,
  mark2Dir: string,
  apiBaseUrl: string,
  agentToken: string,
): Promise<CodeReviewResult> {
  const db = getDb(mark2Dir);
  const now = new Date().toISOString();

  // Reuse the existing worktree
  const worktreePath = path.join(projectRoot, '.worktrees', task.id, 'design');

  // Get the diff for review
  let diff = '';
  try {
    diff = await getDiff(worktreePath);
  } catch {
    diff = '(Unable to generate diff)';
  }

  // Read the design document for context
  let designDocument: string | undefined;
  const designPath = path.join(worktreePath, 'design.md');
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

  // Assemble the prompt
  const assembler = new PromptAssembler(mark2Dir);
  const prompt = assembler.assemble(task, agent, 'code_review', promptContext);

  // Build invocation params
  const params: AgentInvocationParams = {
    prompt,
    workingDirectory: worktreePath,
    agentName: agent.name,
    model: agent.model,
    taskId: task.id,
    phase: 'code_review',
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
    phase: 'code_review',
    command,
    workingDir: worktreePath,
    env,
  });

  // Log activity
  db.insert(activityEntries)
    .values({
      task_id: task.id,
      timestamp: now,
      source: 'orchestration',
      type: 'phase_change',
      message: `Code review phase started. Agent "${agent.name}" spawned in TMUX session "${tmuxSession}".`,
      metadata_json: JSON.stringify({
        agent: agent.name,
        tmux_session: tmuxSession,
        diff_length: diff.length,
      }),
    })
    .run();

  return { tmuxSession, promptFile };
}
