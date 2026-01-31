import type { CLIAdapter } from './types';
import type { AgentInvocationParams } from '../../types';

/**
 * Adapter for the OpenCode CLI.
 */
export class OpenCodeAdapter implements CLIAdapter {
  readonly toolId = 'opencode' as const;
  readonly supportsMCP = false;
  readonly supportsNaming = false;

  buildCommand(params: AgentInvocationParams): string {
    const parts: string[] = [
      'opencode',
      '--model', this.shellQuote(params.model),
      this.shellQuote(params.prompt),
    ];

    return parts.join(' ');
  }

  getEnvironment(params: AgentInvocationParams): Record<string, string> {
    return {
      MARK2_AGENT_TOKEN: params.agentToken,
      MARK2_API_URL: params.apiBaseUrl,
      MARK2_TASK_ID: params.taskId,
    };
  }

  private shellQuote(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
  }
}
