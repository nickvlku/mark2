import fs from 'fs';
import path from 'path';
import type { Task, AgentDefinition } from '../../yaml/schemas';
import { createWorktree } from '../../utils/git';
import { getDb } from '../../db';
import { activityEntries, worktreeRecords } from '../../db/schema';
import { TmuxManager } from '../tmux-manager';
import { PromptAssembler } from '../prompt-assembler';
import type { CLIAdapter } from '../../adapters/types';
import type { AgentInvocationParams } from '../../../types';
import type { PromptContext } from '../prompt-assembler';

export interface DesignResult {
  tmuxSession: string;
  worktreePath: string;
  branchName: string;
  promptFile?: string;
}

/**
 * Handle the design phase for a task.
 *
 * 1. Create a git worktree for the task
 * 2. Assemble the design prompt
 * 3. Spawn the agent in a TMUX session
 */
export async function handleDesign(
  task: Task,
  agent: AgentDefinition,
  adapter: CLIAdapter,
  projectRoot: string,
  mark2Dir: string,
  apiBaseUrl: string,
  agentToken: string,
  loopContext?: { humanComments?: string; testFailures?: string; reviewComments?: string },
): Promise<DesignResult> {
  const db = getDb(mark2Dir);
  const now = new Date().toISOString();
  const branchName = `mark2/${task.id}/design`;
  const worktreePath = path.join(projectRoot, '.worktrees', task.id, 'design');

  // Create the git worktree only if it doesn't already exist (restart case)
  if (!fs.existsSync(worktreePath)) {
    await createWorktree(projectRoot, worktreePath, branchName);

    // Record the worktree
    db.insert(worktreeRecords)
      .values({
        task_id: task.id,
        agent_name: agent.name,
        worktree_path: worktreePath,
        branch_name: branchName,
        created_at: now,
        status: 'active',
      })
      .run();
  }

  // Assemble the prompt (include any context from restart)
  const assembler = new PromptAssembler(mark2Dir);
  const promptContext: PromptContext | undefined = loopContext
    ? { humanComments: loopContext.humanComments, testFailures: loopContext.testFailures, reviewComments: loopContext.reviewComments }
    : undefined;
  const prompt = assembler.assemble(task, agent, 'design', promptContext);

  // Build invocation params
  const params: AgentInvocationParams = {
    prompt,
    workingDirectory: worktreePath,
    agentName: agent.name,
    model: agent.model,
    taskId: task.id,
    phase: 'design',
    apiBaseUrl,
    agentToken,
    timeoutMinutes: agent.timeout_minutes,
  };

  // Build command and environment via adapter
  const command = adapter.buildCommand(params);
  const env = adapter.getEnvironment(params);
  const promptFile = adapter.getPromptFilePath?.(params);

  // Spawn the agent
  const tmuxManager = new TmuxManager(mark2Dir);
  const tmuxSession = await tmuxManager.spawnAgent({
    taskId: task.id,
    agentName: agent.name,
    phase: 'design',
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
      message: `Design phase started. Agent "${agent.name}" spawned in TMUX session "${tmuxSession}".`,
      metadata_json: JSON.stringify({
        agent: agent.name,
        tmux_session: tmuxSession,
        worktree: worktreePath,
        branch: branchName,
      }),
    })
    .run();

  return { tmuxSession, worktreePath, branchName, promptFile };
}
