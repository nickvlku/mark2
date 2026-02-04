import type { Task } from '../../yaml/schemas';
import type { CLIAdapter } from '../../adapters/types';
import { runPhase, type RoleConfig } from './run-phase';

export interface FinalTestingResult {
  tmuxSession: string;
  promptFile?: string;
}

/**
 * Handle the final_testing phase for a task.
 *
 * This phase runs after code review approval to verify all tests still pass.
 * If tests fail, the task goes to fix_review instead of looping back to coding.
 * The agent fetches any needed context (design doc, etc.) via MCP tools.
 */
export async function handleFinalTesting(
  task: Task,
  role: RoleConfig,
  adapter: CLIAdapter,
  _projectRoot: string,
  mark2Dir: string,
  apiBaseUrl: string,
  agentToken: string,
): Promise<FinalTestingResult> {
  const result = await runPhase(task, role, adapter, mark2Dir, apiBaseUrl, agentToken, 'final_testing', {
    getPromptContext: () => ({}), // Agent fetches context via MCP tools
    activityMessage: () => `Final testing phase started after code review approval`,
    activityMetadata: (ctx) => ({
      role: ctx.role.name,
      tmux_session: ctx.tmuxSession,
      phase: 'final_testing',
    }),
    activitySource: (ctx) => ctx.role.name,
  });
  return { tmuxSession: result.tmuxSession, promptFile: result.promptFile };
}
