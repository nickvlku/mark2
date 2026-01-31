import type { Task, AgentDefinition } from '../../yaml/schemas';
import type { CLIAdapter } from '../../adapters/types';
import { runAgentPhase } from './run-agent-phase';
import type { PromptContext } from '../prompt-assembler';

export interface DesignResult {
  tmuxSession: string;
  clonePath: string;
  branchName: string;
  promptFile?: string;
}

/**
 * Handle the design phase for a task.
 *
 * 1. Create a git clone for the task (isolated from main repo)
 * 2. Assemble the design prompt
 * 3. Spawn the agent in a TMUX session
 */
export async function handleDesign(
  task: Task,
  agent: AgentDefinition,
  adapter: CLIAdapter,
  _projectRoot: string,
  mark2Dir: string,
  apiBaseUrl: string,
  agentToken: string,
  loopContext?: { humanComments?: string; testFailures?: string; reviewComments?: string },
): Promise<DesignResult> {
  const result = await runAgentPhase(task, agent, adapter, mark2Dir, apiBaseUrl, agentToken, 'design', {
    createCloneFirst: true,
    phaseContext: loopContext,
    getPromptContext: (_clonePath, _task, phaseContext): PromptContext | undefined => {
      const ctx = phaseContext as
        | { humanComments?: string; testFailures?: string; reviewComments?: string }
        | undefined;
      return ctx
        ? {
            humanComments: ctx.humanComments,
            testFailures: ctx.testFailures,
            reviewComments: ctx.reviewComments,
          }
        : undefined;
    },
    activityMessage: (ctx) =>
      `Design phase started. Agent "${ctx.agent.name}" spawned in TMUX session "${ctx.tmuxSession}".`,
    activityMetadata: (ctx) => ({
      agent: ctx.agent.name,
      tmux_session: ctx.tmuxSession,
      clone_path: ctx.clonePath,
      branch: ctx.branchName,
    }),
  });

  return {
    tmuxSession: result.tmuxSession,
    clonePath: result.clonePath!,
    branchName: result.branchName!,
    promptFile: result.promptFile,
  };
}
