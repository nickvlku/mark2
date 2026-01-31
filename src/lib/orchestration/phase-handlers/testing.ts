import fs from 'fs';
import type { Task, AgentDefinition } from '../../yaml/schemas';
import type { CLIAdapter } from '../../adapters/types';
import { runAgentPhase } from './run-agent-phase';
import type { PromptContext } from '../prompt-assembler';

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
  _projectRoot: string,
  mark2Dir: string,
  apiBaseUrl: string,
  agentToken: string,
): Promise<TestingResult> {
  const result = await runAgentPhase(task, agent, adapter, mark2Dir, apiBaseUrl, agentToken, 'testing', {
    getPromptContext: (clonePath) => {
      let designDocument: string | undefined;
      const designPath = `${clonePath}/design.md`;
      try {
        if (fs.existsSync(designPath)) {
          designDocument = fs.readFileSync(designPath, 'utf-8');
        }
      } catch {
        // Design doc may not exist
      }
      const promptContext: PromptContext = { designDocument };
      return promptContext;
    },
    activityMessage: (ctx) =>
      `Testing phase started. Agent "${ctx.agent.name}" spawned in TMUX session "${ctx.tmuxSession}".`,
    activityMetadata: (ctx) => ({
      agent: ctx.agent.name,
      tmux_session: ctx.tmuxSession,
    }),
  });
  return { tmuxSession: result.tmuxSession, promptFile: result.promptFile };
}
