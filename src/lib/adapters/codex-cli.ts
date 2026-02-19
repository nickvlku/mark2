import type { CLIAdapter } from './types';
import type { AgentInvocationParams } from '../../types';
import { getTaskStoragePaths } from '../utils/storage';
import fs from 'fs';
import path from 'path';

/**
 * Adapter for OpenAI's Codex CLI.
 * Runs in full-auto mode. Does not support MCP or session naming.
 */
export class CodexCLIAdapter implements CLIAdapter {
  readonly toolId = 'codex-cli' as const;
  readonly supportsMCP = false;
  readonly supportsNaming = false;

  buildCommand(params: AgentInvocationParams): string {
    const parts: string[] = [
      'codex',
      '--full-auto',
      '--model', this.shellQuote(params.model),
      this.shellQuote(params.prompt),
    ];

    return parts.join(' ');
  }

  getEnvironment(params: AgentInvocationParams): Record<string, string> {
    const projectRoot = this.getProjectRoot(params.workingDirectory, params.taskId);
    const storagePaths = getTaskStoragePaths(projectRoot, params.taskId);

    return {
      NODE_ENV: 'development',
      MARK2_AGENT_TOKEN: params.agentToken,
      MARK2_API_URL: params.apiBaseUrl,
      MARK2_TASK_ID: params.taskId,
      MARK2_STORAGE_DIR: storagePaths.root,
      MARK2_ARTIFACTS_DIR: storagePaths.artifacts,
      MARK2_PROMPTS_DIR: storagePaths.prompts,
      MARK2_SESSIONS_DIR: storagePaths.sessions,
    };
  }

  private getProjectRoot(workingDirectory: string, _taskId: string): string {
    const mark2Index = workingDirectory.indexOf('.mark2');
    if (mark2Index !== -1) {
      return workingDirectory.substring(0, mark2Index).replace(/\/$/, '');
    }

    const worktreesIndex = workingDirectory.indexOf('.worktrees');
    if (worktreesIndex !== -1) {
      return workingDirectory.substring(0, worktreesIndex).replace(/\/$/, '');
    }

    return workingDirectory;
  }

  private shellQuote(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
  }

  /**
   * Remove configuration files created during buildCommand().
   * Best-effort: errors are logged but never thrown.
   */
  async cleanup(workingDirectory: string): Promise<void> {
    // 1. Delete .codex/config.toml
    try {
      await fs.promises.unlink(path.join(workingDirectory, '.codex', 'config.toml'));
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? err.code : null;
      if (code !== 'ENOENT') {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`[codex-cli] cleanup: failed to delete .codex/config.toml: ${message}`);
      }
    }

    // 2. Delete AGENTS.md
    try {
      await fs.promises.unlink(path.join(workingDirectory, 'AGENTS.md'));
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? err.code : null;
      if (code !== 'ENOENT') {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`[codex-cli] cleanup: failed to delete AGENTS.md: ${message}`);
      }
    }

    // 3. Remove .codex directory only if empty
    try {
      await fs.promises.rmdir(path.join(workingDirectory, '.codex'));
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? err.code : null;
      if (code !== 'ENOENT' && code !== 'ENOTEMPTY') {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`[codex-cli] cleanup: failed to remove .codex directory: ${message}`);
      }
    }
  }
}
