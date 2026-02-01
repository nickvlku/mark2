import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { CLIAdapter } from './types';
import type { AgentInvocationParams } from '../../types';
import {
  getTaskStoragePaths,
  ensureTaskStorageExistsSync,
} from '../utils/storage';

/**
 * Get the mark2 installation directory.
 * This is where the package is installed (containing src/, cli/, etc.)
 * When running from a global install, we need to find the correct path.
 */
function getMark2InstallDir(): string {
  // __dirname will be in src/lib/adapters for this file
  // Go up to find the root of the package
  const possibleRoot = path.join(__dirname, '..', '..', '..');

  // Verify by checking for server.ts
  if (fs.existsSync(path.join(possibleRoot, 'server.ts'))) {
    return possibleRoot;
  }

  // Fallback: assume cwd is the mark2 install
  return process.cwd();
}

/**
 * Adapter for Anthropic's Claude Code CLI.
 *
 * Uses Claude's native CLI flags for clean separation of concerns:
 * - --append-system-prompt: Orchestration instructions (phase rules, MCP tools, etc.)
 * - --agents: Defines the agent with role/personality prompt only
 * - --agent: Selects the defined agent
 * - --session-id: Tracks the session
 * - First argument: Task description only
 *
 * End token detection via Claude Code Stop hook (no polling).
 */
export class ClaudeCodeAdapter implements CLIAdapter {
  readonly toolId = 'claude-code' as const;
  readonly supportsMCP = true;
  readonly supportsNaming = true;

  buildCommand(params: AgentInvocationParams): string {
    const projectRoot = this.getProjectRoot(params.workingDirectory, params.taskId);

    // Ensure storage directories exist
    ensureTaskStorageExistsSync(projectRoot, params.taskId);

    // Set up Claude Code Stop hook for end token detection
    this.setupClaudeHooks(params.workingDirectory, projectRoot);

    // Generate a session ID for tracking
    const sessionId = crypto.randomUUID();

    // Save prompts for debugging/review
    const storagePaths = getTaskStoragePaths(projectRoot, params.taskId);
    fs.writeFileSync(path.join(storagePaths.prompts, `${params.phase}-orchestration.md`), params.orchestrationPrompt ?? '', 'utf-8');
    fs.writeFileSync(path.join(storagePaths.prompts, `${params.phase}-agent.md`), params.agentPrompt ?? '', 'utf-8');
    fs.writeFileSync(path.join(storagePaths.prompts, `${params.phase}-task.md`), params.taskPrompt ?? '', 'utf-8');

    // Build agent definition for --agents flag (personality/role only)
    const agentSlug = params.agentSlug ?? `mark2-${params.phase}`;
    const agentDef = {
      [agentSlug]: {
        description: `Mark2 ${params.phase} agent for ${params.taskId}`,
        prompt: params.agentPrompt ?? '',
      },
    };

    // The task prompt is what Claude actually works on (first argument)
    const taskPrompt = params.taskPrompt ?? params.prompt;

    // Build MCP server config for mark2 tools (pass clone dir for artifact storage)
    const mcpConfig = this.buildMcpConfig(projectRoot, params.taskId, params.apiBaseUrl);

    // Build command with native Claude CLI flags
    const parts: string[] = [
      'claude',
      this.shellQuote(taskPrompt),
      '--dangerously-skip-permissions',
      '--model', this.shellQuote(params.model),
      '--session-id', sessionId,
      '--mcp-config', this.shellQuote(JSON.stringify(mcpConfig)),
    ];

    // Add orchestration prompt via --append-system-prompt
    if (params.orchestrationPrompt) {
      parts.push('--append-system-prompt', this.shellQuote(params.orchestrationPrompt));
    }

    // Add agent definition and selection
    parts.push(
      '--agents', this.shellQuote(JSON.stringify(agentDef)),
      '--agent', agentSlug,
    );

    return parts.join(' ');
  }

  /**
   * Build MCP server configuration for mark2 tools.
   * This makes mark2_save_artifact, mark2_signal_complete, etc. available to the agent.
   */
  private buildMcpConfig(projectRoot: string, taskId: string, apiBaseUrl: string): object {
    const mark2Dir = path.join(projectRoot, '.mark2');

    // Find the MCP server in the mark2 installation directory
    // This allows mark2 to work when installed globally
    const installDir = getMark2InstallDir();
    const mcpServerPath = path.join(installDir, 'src', 'lib', 'mcp', 'index.ts');

    return {
      mcpServers: {
        mark2: {
          command: 'npx',
          args: ['tsx', mcpServerPath],
          env: {
            MARK2_DIR: mark2Dir,
            MARK2_TASK_ID: taskId,
            MARK2_PROJECT_ROOT: projectRoot,
            MARK2_API_URL: apiBaseUrl,
          },
        },
      },
    };
  }

  /**
   * Set up Claude Code hooks in the working directory.
   * Creates .claude/settings.local.json with a Stop hook for end token detection.
   */
  private setupClaudeHooks(workingDirectory: string, projectRoot: string): void {
    const claudeDir = path.join(workingDirectory, '.claude');
    const settingsPath = path.join(claudeDir, 'settings.local.json');

    // Find the hook script in the mark2 installation directory
    // This allows mark2 to work when installed globally
    const installDir = getMark2InstallDir();
    const hookScriptPath = path.join(installDir, 'cli', 'hooks', 'end-token-hook.ts');

    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    const settings = {
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: 'command',
                command: `npx tsx "${hookScriptPath}"`,
              },
            ],
          },
        ],
      },
    };

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  /**
   * No longer used - prompt is passed directly via CLI argument.
   * Kept for interface compatibility.
   */
  getPromptFilePath(_params: AgentInvocationParams): string | undefined {
    return undefined;
  }

  getEnvironment(params: AgentInvocationParams): Record<string, string> {
    const projectRoot = this.getProjectRoot(params.workingDirectory, params.taskId);
    const storagePaths = getTaskStoragePaths(projectRoot, params.taskId);

    return {
      // Ensure NODE_ENV is set to a standard value to avoid Next.js warnings
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
}
