# Claude Code Adapter

This document provides detailed documentation for Mark2's Claude Code adapter, the primary and most feature-rich CLI integration.

## Overview

The Claude Code adapter leverages Claude Code's native CLI features for optimal integration:

- **MCP Integration**: Full support for the Mark2 MCP server
- **Split Prompts**: Uses `--append-system-prompt`, `--agents`, and `--agent` flags
- **Stop Hooks**: Automatic end token detection without polling
- **Session Tracking**: UUID-based session identification

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Claude Code Invocation                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  claude '<task_prompt>'                                             │
│    --dangerously-skip-permissions                                   │
│    --model 'claude-sonnet-4-20250514'                              │
│    --session-id '<uuid>'                                            │
│    --mcp-config '<mark2_mcp_config>'                               │
│    --append-system-prompt '<orchestration_instructions>'            │
│    --agents '<agent_definition>'                                    │
│    --agent 'mark2-design'                                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Command Structure

### Full Command Example

```bash
claude 'Task ID: TASK-12
Title: Implement user authentication

## Description
Add login/logout functionality with JWT tokens...' \
  --dangerously-skip-permissions \
  --model 'claude-opus-4-20250514' \
  --session-id 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' \
  --mcp-config '{"mcpServers":{"mark2":{"command":"npx","args":["tsx","src/lib/mcp/index.ts"],"env":{...}}}}' \
  --append-system-prompt '# ORCHESTRATION INSTRUCTIONS

Current phase: design
Task ID: TASK-12

## CRITICAL: File Operations
...' \
  --agents '{"mark2-design":{"description":"Mark2 design agent for TASK-12","prompt":"You are an expert system architect..."}}' \
  --agent 'mark2-design'
```

### Flag Breakdown

| Flag | Purpose | Content |
|------|---------|---------|
| First argument | Task prompt | Task description and context |
| `--dangerously-skip-permissions` | Allow file operations | Required for autonomous operation |
| `--model` | Model selection | Model identifier (e.g., `claude-opus-4-20250514`) |
| `--session-id` | Session tracking | Random UUID for this invocation |
| `--mcp-config` | MCP server config | JSON config for mark2 MCP server |
| `--append-system-prompt` | Orchestration | Phase rules, MCP instructions, end tokens |
| `--agents` | Agent definition | JSON defining the agent's personality |
| `--agent` | Agent selection | Which agent to use (matches key in `--agents`) |

---

## Prompt Separation

The adapter splits the prompt into three parts:

### 1. Task Prompt (First Argument)

What the agent should actually work on:

```markdown
# TASK

Task ID: TASK-12
Title: Implement user authentication

## Description
Add login/logout functionality with JWT tokens...

## Design Document
[Previous phase output, if applicable]
```

### 2. Orchestration Prompt (`--append-system-prompt`)

Phase-specific instructions and MCP tool guidance:

```markdown
# ORCHESTRATION INSTRUCTIONS

Current phase: design
Task ID: TASK-12

## CRITICAL: File Operations
You are running in an isolated git clone for this task.
...

## Git Operations (CRITICAL)
You MUST use the Mark2 MCP tools for all git operations.
...

## Saving Artifacts
Use the `mark2_save_artifact` MCP tool to save artifacts.
...

## Signaling Phase Completion
When you have completed all work for this phase, use the `mark2_signal_complete` MCP tool.
...

You are in the DESIGN phase. Your job is to:
1. Analyze the task requirements thoroughly
2. Produce a design document covering architecture, data models, API contracts...
...

Valid completion tokens for this phase: [DESIGN_COMPLETED]
```

### 3. Agent Prompt (`--agents`)

Role/personality definition:

```json
{
  "mark2-design": {
    "description": "Mark2 design agent for TASK-12",
    "prompt": "You are an expert system architect with deep experience in distributed systems, microservices, and scalable architecture patterns.\n\nYour responsibilities:\n- Design system architecture that is scalable, maintainable, and resilient\n..."
  }
}
```

---

## MCP Server Configuration

The adapter configures Claude Code to connect to the Mark2 MCP server:

```typescript
private buildMcpConfig(projectRoot: string, taskId: string, apiBaseUrl: string): object {
  const mark2Dir = path.join(projectRoot, '.mark2');
  const mcpServerPath = path.join(projectRoot, 'src', 'lib', 'mcp', 'index.ts');

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
```

### MCP Config JSON

```json
{
  "mcpServers": {
    "mark2": {
      "command": "npx",
      "args": ["tsx", "/path/to/project/src/lib/mcp/index.ts"],
      "env": {
        "MARK2_DIR": "/path/to/project/.mark2",
        "MARK2_TASK_ID": "TASK-12",
        "MARK2_PROJECT_ROOT": "/path/to/project",
        "MARK2_API_URL": "http://localhost:3100"
      }
    }
  }
}
```

This makes the following tools available to Claude:
- `mark2_save_artifact`
- `mark2_get_artifact`
- `mark2_get_latest_artifact`
- `mark2_get_design`
- `mark2_list_artifacts`
- `mark2_git_status`
- `mark2_git_commit`
- `mark2_git_push`
- `mark2_git_sync`
- `mark2_signal_complete`
- `mark2_report_status`
- `mark2_log_activity`
- `mark2_get_task`
- `mark2_get_paths`

See [MCP_SERVER.md](./MCP_SERVER.md) for full tool documentation.

---

## Stop Hook Integration

### How It Works

Claude Code supports **hooks** - scripts that run at specific lifecycle events. Mark2 uses the `Stop` hook for end token detection.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Claude Code    │     │   Stop Hook     │     │   Mark2 API     │
│  (agent work)   │     │  (detection)    │     │  (transition)   │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ Agent completes       │                       │
         │ response              │                       │
         │──────────────────────►│                       │
         │                       │                       │
         │                       │ Read transcript       │
         │                       │ Check for end tokens  │
         │                       │                       │
         │                       │ Found [DESIGN_COMPLETED]
         │                       │──────────────────────►│
         │                       │                       │
         │                       │                       │ Process transition
         │                       │                       │ Start next phase
         │                       │                       │
```

### Hook Setup

The adapter creates `.claude/settings.local.json` in the clone directory:

```typescript
private setupClaudeHooks(workingDirectory: string, projectRoot: string): void {
  const claudeDir = path.join(workingDirectory, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.local.json');
  const hookScriptPath = path.join(projectRoot, 'cli', 'hooks', 'end-token-hook.ts');

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
```

### Settings File Structure

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx tsx \"/path/to/project/cli/hooks/end-token-hook.ts\""
          }
        ]
      }
    ]
  }
}
```

---

## End Token Hook

Located at `cli/hooks/end-token-hook.ts`, this script:

1. **Receives hook input** from Claude Code via stdin
2. **Reads the transcript** to find the last assistant message
3. **Checks for end tokens** like `[DESIGN_COMPLETED]`
4. **Signals the Mark2 API** to trigger phase transition

### Hook Input Format

```json
{
  "session_id": "a1b2c3d4-...",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/clone",
  "hook_event_name": "Stop"
}
```

### End Token Detection

The hook searches for these tokens:

```typescript
const END_TOKENS: Record<string, string[]> = {
  design: ['[DESIGN_COMPLETED]'],
  coding: ['[CODING_COMPLETED]'],
  testing: ['[TESTING_PASSED]', '[TESTING_FAILED]'],
  code_review: ['[REVIEW_COMPLETED]'],
  manual_testing: ['[MANUAL_TESTING_READY]'],
  done: ['[TASK_COMPLETED]'],
};
```

### API Call

When an end token is found:

```typescript
await fetch(`${apiUrl}/api/tasks/${taskId}/phase/hook-complete`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${agentToken}`,
  },
  body: JSON.stringify({
    token: foundToken,
    session_id: hookInput.session_id,
    transcript_path: transcriptPath,
  }),
});
```

---

## Environment Variables

The adapter sets these environment variables for the TMUX session:

| Variable | Description | Example |
|----------|-------------|---------|
| `MARK2_AGENT_TOKEN` | Auth token for API calls | `abc123...` |
| `MARK2_API_URL` | Mark2 API server | `http://localhost:3100` |
| `MARK2_TASK_ID` | Current task | `TASK-12` |
| `MARK2_STORAGE_DIR` | Task storage root | `/path/.mark2/storage/TASK-12` |
| `MARK2_ARTIFACTS_DIR` | Artifacts directory | `/path/.mark2/storage/TASK-12/artifacts` |
| `MARK2_PROMPTS_DIR` | Prompts directory | `/path/.mark2/storage/TASK-12/prompts` |
| `MARK2_SESSIONS_DIR` | Sessions directory | `/path/.mark2/storage/TASK-12/sessions` |

---

## Prompt Storage

The adapter saves all prompts for debugging/review:

```typescript
const storagePaths = getTaskStoragePaths(projectRoot, params.taskId);
fs.writeFileSync(
  path.join(storagePaths.prompts, `${params.phase}-orchestration.md`),
  params.orchestrationPrompt ?? '',
  'utf-8'
);
fs.writeFileSync(
  path.join(storagePaths.prompts, `${params.phase}-agent.md`),
  params.agentPrompt ?? '',
  'utf-8'
);
fs.writeFileSync(
  path.join(storagePaths.prompts, `${params.phase}-task.md`),
  params.taskPrompt ?? '',
  'utf-8'
);
```

Results in:
```
.mark2/storage/TASK-12/prompts/
├── design-orchestration.md
├── design-agent.md
├── design-task.md
├── coding-orchestration.md
├── coding-agent.md
├── coding-task.md
└── ...
```

---

## Project Root Detection

The adapter determines the project root from the working directory:

```typescript
private getProjectRoot(workingDirectory: string, _taskId: string): string {
  // Check if we're in a .mark2/clones/TASK-ID directory
  const mark2Index = workingDirectory.indexOf('.mark2');
  if (mark2Index !== -1) {
    return workingDirectory.substring(0, mark2Index).replace(/\/$/, '');
  }

  // Check for legacy .worktrees structure
  const worktreesIndex = workingDirectory.indexOf('.worktrees');
  if (worktreesIndex !== -1) {
    return workingDirectory.substring(0, worktreesIndex).replace(/\/$/, '');
  }

  return workingDirectory;
}
```

This handles:
- Clone directories: `/project/.mark2/clones/TASK-12` → `/project`
- Legacy worktrees: `/project/.worktrees/TASK-12` → `/project`
- Direct paths: `/project` → `/project`

---

## Shell Quoting

All values are safely quoted to prevent shell injection:

```typescript
private shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
```

This handles:
- Single quotes in content
- Special characters
- Multi-line strings (like prompts)

---

## Execution Flow

### 1. Adapter Invoked

```typescript
const command = adapter.buildCommand(params);
const env = adapter.getEnvironment(params);
```

### 2. Storage Setup

- Ensures `.mark2/storage/TASK-ID/` directories exist
- Saves prompts for debugging

### 3. Hook Setup

- Creates `.claude/settings.local.json` in clone
- Configures Stop hook for end token detection

### 4. Command Built

```bash
claude '<task>' --dangerously-skip-permissions --model '...' ...
```

### 5. TMUX Session Started

```typescript
const tmuxSession = await tmuxManager.spawnAgent({
  taskId: task.id,
  agentName: agent.name,
  phase: 'design',
  command,
  workingDir: clonePath,
  env,
});
```

### 6. Agent Executes

- Claude Code runs in TMUX session
- Agent works on the task
- MCP tools available for Mark2 operations

### 7. Agent Signals Completion

```typescript
// Agent calls MCP tool
mark2_signal_complete(task_id: "TASK-12", token: "[DESIGN_COMPLETED]")
```

Or emits the token as text, which the Stop hook detects.

### 8. Phase Transition

- Stop hook (or MCP tool) calls Mark2 API
- Engine processes the transition
- Next phase starts

---

## Debugging

### View Saved Prompts

```bash
cat .mark2/storage/TASK-12/prompts/design-orchestration.md
cat .mark2/storage/TASK-12/prompts/design-agent.md
cat .mark2/storage/TASK-12/prompts/design-task.md
```

### Attach to Running Session

```bash
tmux attach -t mark2-TASK-12-design
```

### Check Hook Settings

```bash
cat .mark2/clones/TASK-12/.claude/settings.local.json
```

### View Hook Output

The hook logs to stderr, visible in the TMUX session:
```
[mark2-hook] End token detected: [DESIGN_COMPLETED]
[mark2-hook] Phase completion signaled for TASK-12
```

### Test Hook Manually

```bash
echo '{"hook_event_name":"Stop","transcript_path":"/path/to/transcript.jsonl"}' | \
  MARK2_TASK_ID=TASK-12 MARK2_API_URL=http://localhost:3100 \
  npx tsx cli/hooks/end-token-hook.ts
```

---

## Common Issues

### Hook Not Triggering

1. **Check settings file exists**:
   ```bash
   ls -la .mark2/clones/TASK-12/.claude/settings.local.json
   ```

2. **Verify hook script path**:
   ```bash
   cat .mark2/clones/TASK-12/.claude/settings.local.json | jq .
   ```

3. **Check environment variables**:
   The hook needs `MARK2_TASK_ID` and `MARK2_API_URL` set.

### MCP Tools Not Available

1. **Check MCP config**:
   Look for `--mcp-config` in the command.

2. **Verify MCP server starts**:
   ```bash
   MARK2_DIR=.mark2 npx tsx src/lib/mcp/index.ts
   ```

3. **Check for errors in Claude output**:
   MCP connection errors appear in the TMUX session.

### Prompt Too Long

If the prompt exceeds shell limits:
1. Check prompt file sizes in `.mark2/storage/TASK-12/prompts/`
2. Consider reducing design document size
3. Use artifact references instead of inline content

### Agent Not Using MCP Tools

1. **Check orchestration prompt** - MCP instructions should be present
2. **Verify MCP server is connected** - Look for connection messages
3. **Check tool availability** - Agent should see `mark2_*` tools
