import fs from 'fs';
import type { Task, AgentDefinition } from '../../yaml/schemas';
import { allocatePortsForTask } from '../../utils/port-allocator';
import { portAllocations } from '../../db/schema';
import type { CLIAdapter } from '../../adapters/types';
import { runAgentPhase } from './run-agent-phase';
import type { PromptContext } from '../prompt-assembler';

export interface ManualTestingResult {
  tmuxSession: string;
  allocatedPorts: number[];
  promptFile?: string;
}

/**
 * Handle the manual testing phase for a task.
 *
 * 1. Allocate ports for the task's dev server
 * 2. Assemble the manual testing prompt
 * 3. Spawn the agent to set up the test environment
 */
export async function handleManualTesting(
  task: Task,
  agent: AgentDefinition,
  adapter: CLIAdapter,
  _projectRoot: string,
  mark2Dir: string,
  apiBaseUrl: string,
  agentToken: string,
  basePort: number = 3000,
  portsPerTask: number = 10,
): Promise<ManualTestingResult> {
  const result = await runAgentPhase<{ allocatedPorts: number[] }>(
    task,
    agent,
    adapter,
    mark2Dir,
    apiBaseUrl,
    agentToken,
    'manual_testing',
    {
    getPromptContext: (clonePath): PromptContext => {
      let designDocument: string | undefined;
      const designPath = `${clonePath}/design.md`;
      try {
        if (fs.existsSync(designPath)) {
          designDocument = fs.readFileSync(designPath, 'utf-8');
        }
      } catch {
        // Design doc may not exist
      }
      return { designDocument };
    },
    activityMessage: (ctx) => {
      const ports = ctx.extra?.allocatedPorts ?? [];
      return `Manual testing phase started. Ports allocated: ${ports.join(', ')}. Agent "${ctx.agent.name}" spawned.`;
    },
    activityMetadata: (ctx) => ({
      agent: ctx.agent.name,
      tmux_session: ctx.tmuxSession,
      ports: ctx.extra?.allocatedPorts ?? [],
    }),
    preHook: async ({ taskId, now, db }) => {
      const allocatedPorts = allocatePortsForTask(taskId, basePort, portsPerTask);
      db.insert(portAllocations)
        .values({
          task_id: taskId,
          ports_json: JSON.stringify(allocatedPorts),
          services_json: JSON.stringify({}),
          allocated_at: now,
        })
        .onConflictDoUpdate({
          target: portAllocations.task_id,
          set: {
            ports_json: JSON.stringify(allocatedPorts),
            allocated_at: now,
          },
        })
        .run();
      return { allocatedPorts };
    },
  });
  return {
    tmuxSession: result.tmuxSession,
    allocatedPorts: result.allocatedPorts,
    promptFile: result.promptFile,
  };
}
