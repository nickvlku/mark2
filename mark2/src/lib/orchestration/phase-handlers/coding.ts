import path from 'path';
import fs from 'fs';
import type { Task, AgentDefinition } from '../../yaml/schemas';
import { getDb } from '../../db';
import { activityEntries } from '../../db/schema';
import { TmuxManager } from '../tmux-manager';
import { PromptAssembler, type PromptContext } from '../prompt-assembler';
import type { CLIAdapter } from '../../adapters/types';
import type { AgentInvocationParams } from '../../../types';

export interface CodingResult {
  tmuxSession: string;
}

/**
 * Handle the coding phase for a task.
 *
 * Assembles the coding prompt (with optional loop-back context from test
 * failures or review comments) and spawns the coding agent.
 */
export async function handleCoding(
  task: Task,
  agent: AgentDefinition,
  adapter: CLIAdapter,
  projectRoot: string,
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

  // Determine the worktree path -- reuse the existing worktree from design
  const worktreePath = path.join(projectRoot, '.worktrees', task.id, 'design');

  // Try to read the design document if it exists
  let designDocument: string | undefined;
  const designPath = path.join(worktreePath, 'design.md');
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

  // Assemble the prompt
  const assembler = new PromptAssembler(mark2Dir);
  const prompt = assembler.assemble(task, agent, 'coding', promptContext);

  // Build invocation params
  const params: AgentInvocationParams = {
    prompt,
    workingDirectory: worktreePath,
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

  // Spawn the agent
  const tmuxManager = new TmuxManager(mark2Dir);
  const tmuxSession = await tmuxManager.spawnAgent({
    taskId: task.id,
    agentName: agent.name,
    phase: 'coding',
    command,
    workingDir: worktreePath,
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

  return { tmuxSession };
}
