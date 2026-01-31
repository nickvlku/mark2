import type { Task, AgentDefinition } from '../../yaml/schemas';
import type { CLIAdapter } from '../../adapters/types';
import { runAgentPhase } from './run-agent-phase';
import type { PromptContext } from '../prompt-assembler';

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
  const result = await runAgentPhase(task, agent, adapter, mark2Dir, apiBaseUrl, agentToken, 'fix_review', {
    phaseContext: loopContext,
    getPromptContext: (_clonePath, task) => {
      const promptContext: PromptContext = {
        loopCount: task.loop_count > 0 ? task.loop_count : undefined,
      };
      return promptContext;
    },
    activityMessage: () =>
      `Fix review phase started. Agent will fetch review feedback and test results via MCP tools.`,
    activityMetadata: (ctx) => ({
      agent: ctx.agent.name,
      tmux_session: ctx.tmuxSession,
      phase: 'fix_review',
      loop_count: ctx.task.loop_count,
    }),
    activitySource: (ctx) => ctx.agent.name,
  });
  return { tmuxSession: result.tmuxSession, promptFile: result.promptFile };
}
