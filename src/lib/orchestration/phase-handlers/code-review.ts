import type { Task, AgentDefinition } from '../../yaml/schemas';
import type { CLIAdapter } from '../../adapters/types';
import { runAgentPhase } from './run-agent-phase';
import type { PromptContext } from '../prompt-assembler';

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
  _projectRoot: string,
  mark2Dir: string,
  apiBaseUrl: string,
  agentToken: string,
): Promise<CodeReviewResult> {
  const result = await runAgentPhase(task, agent, adapter, mark2Dir, apiBaseUrl, agentToken, 'code_review', {
    getPromptContext: (): PromptContext => ({}),
    activityMessage: (ctx) =>
      `Code review phase started. Agent "${ctx.agent.name}" spawned in TMUX session "${ctx.tmuxSession}".`,
    activityMetadata: (ctx) => ({
      agent: ctx.agent.name,
      tmux_session: ctx.tmuxSession,
    }),
  });
  return { tmuxSession: result.tmuxSession, promptFile: result.promptFile };
}
