import fs from 'fs';
import path from 'path';
import type { CLIAdapter } from './types';
import type { AgentInvocationParams } from '../../types';
import {
  getTaskStoragePaths,
  ensureTaskStorageExistsSync,
} from '../utils/storage';

/**
 * Adapter for Anthropic's Claude Code CLI.
 *
 * Runs Claude in interactive mode (no --print / -p) so that follow-up
 * comments can be sent to the session via tmux send-keys.  The prompt is
 * written to a file in the storage directory; the TmuxManager delivers it
 * via load-buffer after Claude has initialized.
 */
export class ClaudeCodeAdapter implements CLIAdapter {
  readonly toolId = 'claude-code' as const;
  readonly supportsMCP = true;
  readonly supportsNaming = true;

  buildCommand(params: AgentInvocationParams): string {
    // Get the project root from the working directory
    // Working directory is typically .worktrees/{taskId}/{phase}
    // Project root is 3 levels up
    const projectRoot = this.getProjectRoot(params.workingDirectory, params.taskId);

    // Ensure storage directories exist
    ensureTaskStorageExistsSync(projectRoot, params.taskId);

    // Get storage paths
    const storagePaths = getTaskStoragePaths(projectRoot, params.taskId);

    // Write prompt to storage directory (not worktree)
    const promptFile = path.join(storagePaths.prompts, `${params.phase}.md`);
    fs.writeFileSync(promptFile, params.prompt, 'utf-8');

    const parts: string[] = [
      'claude',
      '--dangerously-skip-permissions',
      '--model', this.shellQuote(params.model),
    ];

    // Add MCP server URL if provided
    if (params.mcpServerUrl) {
      parts.push('--mcp-server', this.shellQuote(params.mcpServerUrl));
    }

    return parts.join(' ');
  }

  /**
   * Return the path where the prompt file was written.
   * Called by the engine/tmux-manager to deliver the prompt after session start.
   */
  getPromptFilePath(params: AgentInvocationParams): string {
    const projectRoot = this.getProjectRoot(params.workingDirectory, params.taskId);
    const storagePaths = getTaskStoragePaths(projectRoot, params.taskId);
    return path.join(storagePaths.prompts, `${params.phase}.md`);
  }

  getEnvironment(params: AgentInvocationParams): Record<string, string> {
    const projectRoot = this.getProjectRoot(params.workingDirectory, params.taskId);
    const storagePaths = getTaskStoragePaths(projectRoot, params.taskId);

    const env: Record<string, string> = {
      // Existing variables
      MARK2_AGENT_TOKEN: params.agentToken,
      MARK2_API_URL: params.apiBaseUrl,
      MARK2_TASK_ID: params.taskId,

      // New storage directories
      MARK2_STORAGE_DIR: storagePaths.root,
      MARK2_ARTIFACTS_DIR: storagePaths.artifacts,
      MARK2_PROMPTS_DIR: storagePaths.prompts,
      MARK2_SESSIONS_DIR: storagePaths.sessions,
    };

    return env;
  }

  /**
   * Get the project root from a worktree path.
   * Worktree paths are: {projectRoot}/.worktrees/{taskId}/{phase}
   */
  private getProjectRoot(workingDirectory: string, taskId: string): string {
    // Find the .worktrees part in the path and go to its parent
    const worktreesIndex = workingDirectory.indexOf('.worktrees');
    if (worktreesIndex !== -1) {
      return workingDirectory.substring(0, worktreesIndex).replace(/\/$/, '');
    }

    // Fallback: assume working directory is 3 levels deep from project root
    // .worktrees/{taskId}/{phase} -> go up 3 levels
    return path.resolve(workingDirectory, '..', '..', '..');
  }

  private shellQuote(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
  }
}
