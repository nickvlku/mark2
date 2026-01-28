import path from 'path';
import fs from 'fs';
import type { Task, AgentDefinition } from '../../yaml/schemas';
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
  agent: AgentDefinition,
  adapter: CLIAdapter,
  projectRoot: string,
  mark2Dir: string,
  apiBaseUrl: string,
  agentToken: string,
): Promise<TestingResult> {
  const db = getDb(mark2Dir);
  const now = new Date().toISOString();

  // Reuse the existing worktree
  const worktreePath = path.join(projectRoot, '.worktrees', task.id, 'design');

  // Try to read the design document for context
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
  };

  // Assemble the prompt
  const assembler = new PromptAssembler(mark2Dir);
  const prompt = assembler.assemble(task, agent, 'testing', promptContext);

  // Build invocation params
  const params: AgentInvocationParams = {
    prompt,
    workingDirectory: worktreePath,
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
      message: `Testing phase started. Agent "${agent.name}" spawned in TMUX session "${tmuxSession}".`,
      metadata_json: JSON.stringify({
        agent: agent.name,
        tmux_session: tmuxSession,
      }),
    })
    .run();

  return { tmuxSession, promptFile };
}
