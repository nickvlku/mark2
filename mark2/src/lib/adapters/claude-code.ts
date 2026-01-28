import fs from 'fs';
import path from 'path';
import type { CLIAdapter } from './types';
import type { AgentInvocationParams } from '../../types';

/**
 * Adapter for Anthropic's Claude Code CLI.
 *
 * Runs Claude in interactive mode (no --print / -p) so that follow-up
 * comments can be sent to the session via tmux send-keys.  The prompt is
 * written to a file; the TmuxManager delivers it via load-buffer after
 * Claude has initialized.
 */
export class ClaudeCodeAdapter implements CLIAdapter {
  readonly toolId = 'claude-code' as const;
  readonly supportsMCP = true;
  readonly supportsNaming = true;

  buildCommand(params: AgentInvocationParams): string {
    // Write prompt to a file — the TmuxManager will paste it into Claude's
    // interactive input after the session starts.
    const promptDir = path.join(params.workingDirectory, '.mark2');
    fs.mkdirSync(promptDir, { recursive: true });
    const promptFile = path.join(promptDir, `prompt-${params.phase}.md`);
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
    return path.join(params.workingDirectory, '.mark2', `prompt-${params.phase}.md`);
  }

  getEnvironment(params: AgentInvocationParams): Record<string, string> {
    const env: Record<string, string> = {
      MARK2_AGENT_TOKEN: params.agentToken,
      MARK2_API_URL: params.apiBaseUrl,
      MARK2_TASK_ID: params.taskId,
    };

    return env;
  }

  private shellQuote(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
  }
}
