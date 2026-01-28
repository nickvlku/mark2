import path from 'path';
import fs from 'fs';
import type { Task, AgentDefinition } from '../../yaml/schemas';
import { allocatePortsForTask } from '../../utils/port-allocator';
import { getDb } from '../../db';
import { activityEntries, portAllocations } from '../../db/schema';
import { TmuxManager } from '../tmux-manager';
import { PromptAssembler, type PromptContext } from '../prompt-assembler';
import type { CLIAdapter } from '../../adapters/types';
import type { AgentInvocationParams } from '../../../types';

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
  projectRoot: string,
  mark2Dir: string,
  apiBaseUrl: string,
  agentToken: string,
  basePort: number = 3000,
  portsPerTask: number = 10,
): Promise<ManualTestingResult> {
  const db = getDb(mark2Dir);
  const now = new Date().toISOString();

  // Allocate ports for this task
  const allocatedPorts = allocatePortsForTask(task.id, basePort, portsPerTask);

  // Record port allocation
  db.insert(portAllocations)
    .values({
      task_id: task.id,
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

  // Reuse the existing worktree
  const worktreePath = path.join(projectRoot, '.worktrees', task.id, 'design');

  // Read the design document for context
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
  const prompt = assembler.assemble(task, agent, 'manual_testing', promptContext);

  // Build invocation params
  const params: AgentInvocationParams = {
    prompt,
    workingDirectory: worktreePath,
    agentName: agent.name,
    model: agent.model,
    taskId: task.id,
    phase: 'manual_testing',
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
    phase: 'manual_testing',
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
      message: `Manual testing phase started. Ports allocated: ${allocatedPorts.join(', ')}. Agent "${agent.name}" spawned.`,
      metadata_json: JSON.stringify({
        agent: agent.name,
        tmux_session: tmuxSession,
        ports: allocatedPorts,
      }),
    })
    .run();

  return { tmuxSession, allocatedPorts, promptFile };
}
