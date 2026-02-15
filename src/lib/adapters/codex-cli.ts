import fs from 'fs';
import path from 'path';
import type { CLIAdapter } from './types';
import type { AgentInvocationParams } from '../../types';
import {
  getTaskStoragePaths,
  ensureTaskStorageExistsSync,
} from '../utils/storage';
import { getMark2InstallDir } from '../utils/mark2-dir';

/**
 * Adapter for OpenAI's Codex CLI.
 * Runs in full-auto mode with MCP support via .codex/config.toml.
 */
export class CodexCLIAdapter implements CLIAdapter {
  readonly toolId = 'codex-cli' as const;
  readonly supportsMCP = true;
  readonly supportsNaming = false;

  buildCommand(params: AgentInvocationParams): string {
    const projectRoot = this.getProjectRoot(params.workingDirectory);

    // Ensure storage directories exist
    ensureTaskStorageExistsSync(projectRoot, params.taskId);

    // Generate .codex/config.toml for MCP server access
    this.setupMcpConfig(params.workingDirectory, projectRoot, params.taskId, params.apiBaseUrl);

    const parts: string[] = [
      'codex',
      '--full-auto',
      '--model', this.shellQuote(params.model),
      this.shellQuote(params.prompt),
    ];

    return parts.join(' ');
  }

  getEnvironment(params: AgentInvocationParams): Record<string, string> {
    const projectRoot = this.getProjectRoot(params.workingDirectory);
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

  /**
   * Set up Codex CLI MCP configuration.
   * Creates .codex/config.toml in the working directory with
   * the mark2 MCP server configured for STDIO transport.
   */
  private setupMcpConfig(workingDirectory: string, projectRoot: string, taskId: string, apiBaseUrl: string): void {
    const codexDir = path.join(workingDirectory, '.codex');
    const configPath = path.join(codexDir, 'config.toml');

    if (!fs.existsSync(codexDir)) {
      fs.mkdirSync(codexDir, { recursive: true });
    }

    const mark2Dir = path.join(projectRoot, '.mark2');
    const installDir = getMark2InstallDir();
    const mcpServerPath = path.join(installDir, 'src', 'lib', 'mcp', 'index.ts');
    const tsxPath = path.join(installDir, 'node_modules', '.bin', 'tsx');

    const toml = this.generateToml(tsxPath, mcpServerPath, {
      MARK2_DIR: mark2Dir,
      MARK2_TASK_ID: taskId,
      MARK2_PROJECT_ROOT: projectRoot,
      MARK2_API_URL: apiBaseUrl,
    });

    fs.writeFileSync(configPath, toml, 'utf-8');
  }

  /**
   * Generate TOML configuration string for Codex CLI MCP servers.
   */
  private generateToml(
    command: string,
    mcpServerPath: string,
    env: Record<string, string>,
  ): string {
    const lines: string[] = [
      '[mcp_servers.mark2]',
      `command = ${this.tomlQuote(command)}`,
      `args = [${this.tomlQuote(mcpServerPath)}]`,
      '',
      '[mcp_servers.mark2.env]',
    ];

    for (const [key, value] of Object.entries(env)) {
      lines.push(`${key} = ${this.tomlQuote(value)}`);
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Quote a string for TOML basic string format.
   * TOML basic strings use double quotes with backslash escaping.
   */
  private tomlQuote(value: string): string {
    return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  private getProjectRoot(workingDirectory: string): string {
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
}
