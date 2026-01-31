import type { CLIAdapter } from './types';
import type { AgentInvocationParams } from '../../types';

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
    return {
      NODE_ENV: 'development',
      MARK2_AGENT_TOKEN: params.agentToken,
      MARK2_API_URL: params.apiBaseUrl,
      MARK2_TASK_ID: params.taskId,
    };
  }

  private shellQuote(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
  }
}
