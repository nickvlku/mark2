import type { AgentInvocationParams } from '../../types';

/**
 * CLIAdapter abstracts the differences between various AI coding CLI tools
 * (claude-code, codex-cli, gemini-cli, opencode) so the orchestration engine
 * can invoke any of them through a uniform interface.
 */
export interface CLIAdapter {
  /** The tool identifier matching the `cli_tool` field in agent definitions. */
  readonly toolId: 'claude-code' | 'codex-cli' | 'gemini-cli' | 'opencode';

  /** Whether the CLI tool supports MCP (Model Context Protocol) server connections. */
  readonly supportsMCP: boolean;

  /** Whether the CLI tool supports naming/labeling invocations. */
  readonly supportsNaming: boolean;

  /**
   * Build the shell command string that will be sent into the TMUX session.
   */
  buildCommand(params: AgentInvocationParams): string;

  /**
   * Return environment variables that should be set before running the command.
   */
  getEnvironment(params: AgentInvocationParams): Record<string, string>;
}
