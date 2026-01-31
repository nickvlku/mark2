import type { Task } from '../../yaml/schemas';
import { ArtifactService } from '../../services/artifact-service';
import type { CLIAdapter } from '../../adapters/types';
import { runPhase, type RoleConfig } from './run-phase';
import type { PromptContext } from '../prompt-assembler';

export interface FinalTestingResult {
  tmuxSession: string;
  promptFile?: string;
}

/**
 * Handle the final_testing phase for a task.
 *
 * This phase runs after code review approval to verify all tests still pass.
 * If tests fail, the task goes to fix_review instead of looping back to coding.
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
    getPromptContext: async (clonePath, task) => {
      const artifactService = new ArtifactService(mark2Dir);
      const { content } = artifactService.getMostRecentContent(task.id, 'design');
      const promptContext: PromptContext = { designDocument: content || undefined };
      return promptContext;
    },
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
