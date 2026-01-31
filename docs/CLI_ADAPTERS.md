# CLI Adapters

This document describes Mark2's CLI adapter system, which provides a uniform interface for invoking different AI coding CLI tools.

## Overview

Mark2 supports multiple AI coding CLI tools through an **adapter pattern**. Each adapter translates Mark2's invocation parameters into the specific command-line format required by that tool.

```
┌──────────────────────────┐
│   Orchestration Engine   │
└───────────┬──────────────┘
            │
            │ AgentInvocationParams
            ▼
┌──────────────────────────┐
│      CLI Adapter         │
│  (claude-code, codex,    │
│   gemini, opencode)      │
└───────────┬──────────────┘
            │
            │ Shell Command + Environment
            ▼
┌──────────────────────────┐
│     TMUX Session         │
│  (isolated execution)    │
└──────────────────────────┘
```

## Supported CLI Tools

| Tool | Adapter | MCP Support | Notes |
|------|---------|-------------|-------|
| [Claude Code](./CLAUDE_CODE_ADAPTER.md) | `claude-code` | Yes | Full integration with hooks, MCP, split prompts |
| Codex CLI | `codex-cli` | No | OpenAI's coding CLI, full-auto mode |
| Gemini CLI | `gemini-cli` | No | Google's Gemini CLI |
| OpenCode | `opencode` | No | Generic OpenAI-compatible CLI |

## Adapter Interface

All adapters implement the `CLIAdapter` interface:

```typescript
interface CLIAdapter {
  /** The tool identifier matching the `cli_tool` field in config. */
  readonly toolId: 'claude-code' | 'codex-cli' | 'gemini-cli' | 'opencode';

  /** Whether the CLI tool supports MCP server connections. */
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

  /**
   * Return the path to a prompt file that should be pasted into the session
   * after the CLI tool has started. Return undefined if the tool receives
   * the prompt inline.
   */
  getPromptFilePath?(params: AgentInvocationParams): string | undefined;
}
```

## Invocation Parameters

All adapters receive `AgentInvocationParams`:

```typescript
interface AgentInvocationParams {
  // Core parameters
  prompt: string;              // The full prompt (for simple adapters)
  workingDirectory: string;    // Clone directory path
  agentName: string;           // Role name
  model: string;               // Model identifier
  taskId: string;              // Task ID (e.g., TASK-12)
  phase: Phase;                // Current phase
  apiBaseUrl: string;          // Mark2 API URL
  agentToken: string;          // Authentication token
  timeoutMinutes: number;      // Maximum runtime

  // Split prompts (for Claude Code)
  orchestrationPrompt?: string;  // For --append-system-prompt
  agentPrompt?: string;          // For --agents flag
  taskPrompt?: string;           // For first CLI argument
  agentSlug?: string;            // For --agent flag
}
```

---

## Claude Code Adapter

**Tool ID:** `claude-code`

The most feature-rich adapter, with full support for:
- MCP server integration (mark2 tools)
- Split prompts via CLI flags
- Stop hooks for end token detection
- Session tracking

See [CLAUDE_CODE_ADAPTER.md](./CLAUDE_CODE_ADAPTER.md) for detailed documentation.

### Command Structure

```bash
claude '<task_prompt>' \
  --dangerously-skip-permissions \
  --model 'claude-sonnet-4-20250514' \
  --session-id '<uuid>' \
  --mcp-config '<json>' \
  --append-system-prompt '<orchestration_prompt>' \
  --agents '<agent_definition_json>' \
  --agent 'mark2-design'
```

### Features

| Feature | Support |
|---------|---------|
| MCP Tools | Yes |
| Split Prompts | Yes |
| End Token Detection | Via Stop hook |
| Session Tracking | Via --session-id |

---

## Codex CLI Adapter

**Tool ID:** `codex-cli`

Adapter for OpenAI's Codex CLI. Runs in full-auto mode with minimal configuration.

### Command Structure

```bash
codex --full-auto --model 'gpt-4' '<prompt>'
```

### Features

| Feature | Support |
|---------|---------|
| MCP Tools | No |
| Split Prompts | No |
| End Token Detection | Transcript polling (if implemented) |
| Session Tracking | No |

### Limitations

- No MCP support - agents must use alternative methods for Mark2 operations
- No split prompts - full prompt is passed as single argument
- End token detection requires output monitoring

---

## Gemini CLI Adapter

**Tool ID:** `gemini-cli`

Adapter for Google's Gemini CLI.

### Command Structure

```bash
gemini --model 'gemini-pro' '<prompt>'
```

### Features

| Feature | Support |
|---------|---------|
| MCP Tools | No |
| Split Prompts | No |
| End Token Detection | Transcript polling (if implemented) |
| Session Tracking | No |

---

## OpenCode Adapter

**Tool ID:** `opencode`

Generic adapter for OpenAI-compatible CLIs.

### Command Structure

```bash
opencode --model 'gpt-4' '<prompt>'
```

### Features

| Feature | Support |
|---------|---------|
| MCP Tools | No |
| Split Prompts | No |
| End Token Detection | Transcript polling (if implemented) |
| Session Tracking | No |

---

## Configuration

### Selecting CLI Tools

CLI tools are configured per-phase in `config.yaml`:

```yaml
phase_defaults:
  design:
    role: expert-system-architect
    cli_tool: claude-code          # Which CLI to use
    model: claude-opus-4-20250514  # Model for that CLI
    auto_advance: false

  coding:
    role: expert-fullstack-coder
    cli_tool: claude-code
    model: claude-sonnet-4-20250514
```

### Task-Level Overrides

Individual tasks can override the CLI tool:

```yaml
# In TASK-1.yaml
phase_overrides:
  coding:
    cli_tool: codex-cli
    model: gpt-4-turbo
```

---

## Environment Variables

All adapters set these environment variables:

| Variable | Description |
|----------|-------------|
| `MARK2_TASK_ID` | Current task ID |
| `MARK2_API_URL` | Mark2 API server URL |
| `MARK2_AGENT_TOKEN` | Authentication token |

Claude Code adapter adds:

| Variable | Description |
|----------|-------------|
| `MARK2_STORAGE_DIR` | Task storage root |
| `MARK2_ARTIFACTS_DIR` | Artifacts directory |
| `MARK2_PROMPTS_DIR` | Prompts directory |
| `MARK2_SESSIONS_DIR` | Sessions directory |

---

## Adding a New Adapter

To add support for a new CLI tool:

### 1. Create the Adapter Class

```typescript
// src/lib/adapters/my-cli.ts
import type { CLIAdapter } from './types';
import type { AgentInvocationParams } from '../../types';

export class MyCLIAdapter implements CLIAdapter {
  readonly toolId = 'my-cli' as const;
  readonly supportsMCP = false;  // or true if supported
  readonly supportsNaming = false;

  buildCommand(params: AgentInvocationParams): string {
    const parts: string[] = [
      'my-cli',
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
```

### 2. Register the Adapter

In `src/lib/orchestration/engine.ts`:

```typescript
import { MyCLIAdapter } from '../adapters/my-cli';

// In constructor
const adapters: CLIAdapter[] = [
  new ClaudeCodeAdapter(),
  new CodexCLIAdapter(),
  new GeminiCLIAdapter(),
  new OpenCodeAdapter(),
  new MyCLIAdapter(),  // Add here
];
```

### 3. Update the Schema

In `src/lib/yaml/schemas.ts`:

```typescript
export const CLIToolEnum = z.enum([
  'claude-code',
  'codex-cli',
  'gemini-cli',
  'opencode',
  'my-cli',  // Add here
]);
```

### 4. Handle MCP (if supported)

If your CLI supports MCP:

```typescript
readonly supportsMCP = true;

buildCommand(params: AgentInvocationParams): string {
  const mcpConfig = this.buildMcpConfig(params);
  // Add MCP config to command
}

private buildMcpConfig(params: AgentInvocationParams): object {
  return {
    mcpServers: {
      mark2: {
        command: 'npx',
        args: ['tsx', 'path/to/mcp/index.ts'],
        env: {
          MARK2_DIR: '...',
          MARK2_TASK_ID: params.taskId,
          // ...
        },
      },
    },
  };
}
```

### 5. Handle End Token Detection

Options for detecting phase completion:

1. **Stop Hook** (Claude Code style): CLI calls a hook when finished
2. **Transcript Polling**: Monitor CLI output for end tokens
3. **MCP Signal**: Agent uses `mark2_signal_complete` tool

---

## MCP vs Non-MCP Adapters

### With MCP Support

Agents use `mark2_*` tools for all Mark2 operations:

```
Agent → mark2_save_artifact → MCP Server → Storage
Agent → mark2_signal_complete → MCP Server → API → Phase Transition
```

### Without MCP Support

Agents must use alternative methods:

1. **Artifacts**: Write files directly, register via API
2. **Phase Completion**: Emit end tokens in output
3. **Git Operations**: Use git commands directly

The prompt must be adjusted to not reference MCP tools for non-MCP adapters.

---

## Prompt Differences

### MCP-Enabled (Claude Code)

```markdown
## Git Operations
Use mark2_git_commit, mark2_git_push, mark2_git_sync for all git operations.

## Saving Artifacts
Use mark2_save_artifact to save and register artifacts.

## Signaling Completion
Use mark2_signal_complete(task_id, token: "[DESIGN_COMPLETED]")
```

### Non-MCP (Codex, Gemini, OpenCode)

```markdown
## Git Operations
Use git commands directly: git add, git commit, git push

## Saving Artifacts
Write files to the artifacts directory and emit:
ARTIFACT_SAVED: design.md

## Signaling Completion
When done, emit the end token as the last line of output:
[DESIGN_COMPLETED]
```

---

## TMUX Integration

All adapters run inside TMUX sessions:

```
┌─────────────────────────────────────────────────────┐
│ TMUX Session: mark2-TASK-12-design                  │
├─────────────────────────────────────────────────────┤
│                                                     │
│ $ claude 'Design the authentication system...'     │
│                                                     │
│ [Agent output streams here]                         │
│                                                     │
│ ...                                                 │
│                                                     │
│ [DESIGN_COMPLETED]                                  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

Session naming convention: `mark2-{TASK_ID}-{PHASE}`

This allows:
- Attaching to running sessions
- Capturing output for end token detection
- Isolating concurrent tasks
