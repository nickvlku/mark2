import type { Task, AgentDefinition } from '../../yaml/schemas';
import { ArtifactService } from '../../services/artifact-service';
import type { CLIAdapter } from '../../adapters/types';
import { runAgentPhase } from './run-agent-phase';
import type { PromptContext } from '../prompt-assembler';

export interface CodingResult {
  tmuxSession: string;
  promptFile?: string;
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
  _projectRoot: string,
  mark2Dir: string,
  apiBaseUrl: string,
  agentToken: string,
  loopContext?: {
    testFailures?: string;
    reviewComments?: string;
    humanComments?: string;
  },
): Promise<CodingResult> {
  const result = await runAgentPhase(task, agent, adapter, mark2Dir, apiBaseUrl, agentToken, 'coding', {
    phaseContext: loopContext,
    getPromptContext: async (clonePath, task, phaseContext) => {
      const artifactService = new ArtifactService(mark2Dir);
      const { content: designContent } = artifactService.getMostRecentContent(task.id, 'design');
      const ctx = phaseContext as
        | { testFailures?: string; reviewComments?: string; humanComments?: string }
        | undefined;
      const promptContext: PromptContext = {
        designDocument: designContent,
        testFailures: ctx?.testFailures,
        reviewComments: ctx?.reviewComments,
        humanComments: ctx?.humanComments,
        loopCount: task.loop_count > 0 ? task.loop_count : undefined,
      };
      return promptContext;
    },
    activityMessage: (ctx) => {
      const isLoop = ctx.task.loop_count > 0;
      return isLoop
        ? `Coding phase restarted (loop #${ctx.task.loop_count}). Agent "${ctx.agent.name}" spawned.`
        : `Coding phase started. Agent "${ctx.agent.name}" spawned in TMUX session "${ctx.tmuxSession}".`;
    },
    activityMetadata: (ctx) => {
      const loopCtx = ctx.phaseContext as
        | { testFailures?: string; reviewComments?: string; humanComments?: string }
        | undefined;
      return {
        agent: ctx.agent.name,
        tmux_session: ctx.tmuxSession,
        loop_count: ctx.task.loop_count,
        has_test_failures: !!loopCtx?.testFailures,
        has_review_comments: !!loopCtx?.reviewComments,
        has_human_comments: !!loopCtx?.humanComments,
      };
    },
  });
  return { tmuxSession: result.tmuxSession, promptFile: result.promptFile };
}
