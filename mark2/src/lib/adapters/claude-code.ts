import type { CLIAdapter } from './types';
import type { AgentInvocationParams } from '../../types';

/**
 * Adapter for Anthropic's Claude Code CLI.
 * Supports MCP server connections and session naming.
 */
export class ClaudeCodeAdapter implements CLIAdapter {
  readonly toolId = 'claude-code' as const;
  readonly supportsMCP = true;
  readonly supportsNaming = true;

  buildCommand(params: AgentInvocationParams): string {
    const parts: string[] = [
      'claude',
      '--dangerously-skip-permissions',
      '--model', this.shellQuote(params.model),
      '--print',
    ];

    // Add MCP server URL if provided
    if (params.mcpServerUrl) {
      parts.push('--mcp-server', this.shellQuote(params.mcpServerUrl));
    }

    // The prompt itself
    parts.push('-p', this.shellQuote(params.prompt));

    return parts.join(' ');
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
    // Use single quotes with escaped internal single quotes for shell safety
    return `'${value.replace(/'/g, "'\\''")}'`;
  }
}
