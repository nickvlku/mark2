# Mark2 MCP Server

This document describes the Mark2 MCP (Model Context Protocol) server, which provides tools for AI coding agents to interact with the Mark2 orchestration system.

## Overview

The MCP server is the bridge between AI agents (like Claude Code) and Mark2's orchestration layer. It exposes tools that allow agents to:

- **Save artifacts** - Design documents, test results, review notes
- **Read artifacts** - Get previous phase outputs
- **Manage git** - Commit, push, sync with main
- **Signal completion** - Trigger phase transitions
- **Report status** - Log progress and activity

### Why MCP?

MCP (Model Context Protocol) is Anthropic's standard for tool integration with AI models. Using MCP means:

1. **Native integration** - Claude Code understands MCP tools natively
2. **Type safety** - Tool parameters are validated with Zod schemas
3. **Separation of concerns** - Agents don't need to know implementation details
4. **Auditability** - All tool calls are logged and traceable

---

## Architecture

```
┌─────────────────┐     stdio      ┌─────────────────┐
│   Claude Code   │ ◄────────────► │   MCP Server    │
│   (AI Agent)    │                │   (Node.js)     │
└─────────────────┘                └────────┬────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    │                       │                       │
                    ▼                       ▼                       ▼
            ┌───────────────┐      ┌───────────────┐      ┌───────────────┐
            │  YAML Files   │      │    SQLite     │      │  Mark2 API    │
            │  (tasks, etc) │      │   Database    │      │  (phase hook) │
            └───────────────┘      └───────────────┘      └───────────────┘
```

### Server Startup

The MCP server is started by Claude Code via the `--mcp-config` flag:

```typescript
// From src/lib/adapters/claude-code.ts
const mcpConfig = {
  mcpServers: {
    mark2: {
      command: 'npx',
      args: ['tsx', 'src/lib/mcp/index.ts'],
      env: {
        MARK2_DIR: '/path/to/.mark2',
        MARK2_TASK_ID: 'TASK-12',
        MARK2_PROJECT_ROOT: '/path/to/project',
        MARK2_API_URL: 'http://localhost:3100',
      },
    },
  },
};
```

The server communicates over **stdio** using the MCP protocol:

```typescript
// From src/lib/mcp/index.ts
const server = createMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MARK2_DIR` | Path to the .mark2 directory | `/home/user/project/.mark2` |
| `MARK2_TASK_ID` | Current task ID | `TASK-12` |
| `MARK2_PROJECT_ROOT` | Project root directory | `/home/user/project` |
| `MARK2_API_URL` | Mark2 API server URL | `http://localhost:3100` |

---

## Available Tools

### Artifact Tools

#### `mark2_save_artifact`

Save and register an artifact for a task. This is the primary way agents deliver work products.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `task_id` | string | The task ID (e.g., `TASK-1`) |
| `filename` | string | Filename for the artifact (e.g., `design.md`) |
| `content` | string | Content of the artifact |

**Behavior:**
- Generates a unique filename: `{phase}-{name}-{timestamp}-{random}.{ext}`
- Saves to `.mark2/storage/{task_id}/artifacts/`
- Registers the artifact in the task's YAML and SQLite

**Example:**
```
mark2_save_artifact(
  task_id: "TASK-12",
  filename: "design.md",
  content: "# Design Document\n\n## Overview..."
)
```

**Response:**
```
Artifact saved: design at /path/.mark2/storage/TASK-12/artifacts/design-design-1769888064916-46x7ev.md
```

---

#### `mark2_list_artifacts`

List all artifacts for a task, sorted chronologically (oldest first).

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `task_id` | string | The task ID |

**Response:**
```
Artifacts for TASK-1:

1. [design] design - design-design-1769816635481-ks6rty.md (2026-01-30T23:43:55.482Z)
2. [testing] test-results - testing-test-results-1769830269844-98juta.md (2026-01-31T03:31:09.845Z)
3. [code_review] review - code_review-review-1769831049550-r95w9y.md (2026-01-31T03:44:09.550Z)
```

---

#### `mark2_get_artifact`

Get the content of a specific artifact by its path.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `task_id` | string | The task ID |
| `artifact_path` | string | The artifact path (from `mark2_list_artifacts`) |

**Example:**
```
mark2_get_artifact(
  task_id: "TASK-1",
  artifact_path: "design-design-1769816635481-ks6rty.md"
)
```

---

#### `mark2_get_latest_artifact`

Get the content of the **most recent** artifact matching a name pattern. This is the preferred way to retrieve artifacts as it automatically returns the latest version.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `task_id` | string | The task ID |
| `name_pattern` | string | Pattern to match artifact name (e.g., `review`, `test`, `design`) |

**Example:**
```
mark2_get_latest_artifact(task_id: "TASK-1", name_pattern: "review")
```

**Response:**
```
[code_review] review (2026-01-31T15:30:19.338Z):

# Code Review

## Summary
The implementation is solid...
```

**Use Cases:**
- `"review"` - Get the latest code review feedback
- `"test"` - Get the latest test results
- `"design"` - Get the design document

---

#### `mark2_get_design`

Shortcut for `mark2_get_latest_artifact(task_id, "design")`.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `task_id` | string | The task ID |

---

#### `mark2_report_artifact` (Legacy)

Register an existing artifact without saving content. Use `mark2_save_artifact` instead.

---

### Git Tools

These tools operate on the task's isolated git clone at `.mark2/clones/{task_id}/`.

#### `mark2_git_status`

Get git status for the task's clone.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `task_id` | string | The task ID |

**Response:**
```
Branch: mark2/TASK-12

Status:
 M src/components/Button.tsx
 M src/lib/utils.ts
?? src/components/NewComponent.tsx
```

---

#### `mark2_git_commit`

Stage all changes and commit in the task's clone.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `task_id` | string | The task ID |
| `message` | string | Commit message |

**Behavior:**
- Runs `git add -A` to stage all changes
- Commits with the provided message
- Returns the short SHA

**Example:**
```
mark2_git_commit(
  task_id: "TASK-12",
  message: "feat: implement user authentication"
)
```

**Response:**
```
Committed: a1b2c3d - feat: implement user authentication
```

---

#### `mark2_git_push`

Push the task branch to origin.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `task_id` | string | The task ID |

**Behavior:**
- Gets the current branch name
- Pushes with `-u origin {branch}`

**Response:**
```
Pushed branch mark2/TASK-12 to origin
```

---

#### `mark2_git_sync`

Sync the task branch with the latest from main (fetch + rebase).

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `task_id` | string | The task ID |

**Behavior:**
- Runs `git fetch origin main`
- Runs `git rebase origin/main`

**Response:**
```
Synced with origin/main successfully
```

---

### Activity Tools

#### `mark2_report_status`

Report current status/progress for a task. Shows up in the activity log.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `task_id` | string | The task ID |
| `status` | string | Current status label |
| `message` | string | Human-readable progress message |

**Example:**
```
mark2_report_status(
  task_id: "TASK-12",
  status: "implementing",
  message: "Working on the authentication module"
)
```

---

#### `mark2_log_activity`

Log an activity entry for a task.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `task_id` | string | The task ID |
| `type` | `note` \| `error` \| `artifact` | Activity type |
| `message` | string | Log message |

---

### Task Tools

#### `mark2_get_task`

Read full task details.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `task_id` | string | The task ID |

**Response:**
```json
{
  "id": "TASK-12",
  "title": "Implement user authentication",
  "description": "Add login/logout functionality...",
  "phase": "coding",
  "priority": "P2",
  "artifacts": [...],
  "created_at": "2026-01-31T14:00:00.000Z",
  ...
}
```

---

#### `mark2_get_paths`

Get storage paths for a task.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `task_id` | string | The task ID |

**Response:**
```json
{
  "root": "/path/.mark2/storage/TASK-12",
  "prompts": "/path/.mark2/storage/TASK-12/prompts",
  "artifacts": "/path/.mark2/storage/TASK-12/artifacts",
  "sessions": "/path/.mark2/storage/TASK-12/sessions",
  "testRuns": "/path/.mark2/storage/TASK-12/test-runs",
  "playwrightReports": "/path/.mark2/storage/TASK-12/playwright-reports"
}
```

---

### Phase Completion

#### `mark2_signal_complete`

Signal phase completion with an end token. This triggers the phase transition.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `task_id` | string | The task ID |
| `token` | string | The end token (e.g., `[DESIGN_COMPLETED]`) |

**Valid Tokens by Phase:**

| Phase | Tokens |
|-------|--------|
| `design` | `[DESIGN_COMPLETED]` |
| `coding` | `[CODING_COMPLETED]` |
| `testing` | `[TESTING_PASSED]`, `[TESTING_FAILED]` |
| `code_review` | `[REVIEW_COMPLETED]`, `[REVIEW_NEEDS_FIXES]` |
| `fix_review` | `[FIX_REVIEW_COMPLETED]` |
| `final_testing` | `[FINAL_TESTING_PASSED]`, `[FINAL_TESTING_FAILED]` |
| `run_test_plan` | `[RUN_TEST_PLAN_PASSED]` |
| `done` | `[TASK_COMPLETED]` |

**Behavior:**
- Calls the Mark2 API at `POST /api/tasks/{task_id}/phase/hook-complete`
- Triggers phase transition (if auto_advance is enabled)
- Returns the new status

**Example:**
```
mark2_signal_complete(task_id: "TASK-12", token: "[DESIGN_COMPLETED]")
```

**Response:**
```
Phase completion signaled for TASK-12 with token: [DESIGN_COMPLETED]. Status: awaiting_approval
```

---

## Agent Instructions

Agents receive instructions on how to use MCP tools via the **orchestration prompt** (passed via `--append-system-prompt`). Here's what agents are told:

### File Operations

```
For file operations, use Claude Code's native tools:
- Read: to read files
- Write: to create new files
- Edit: to modify existing files
- Glob: to find files by pattern
- Grep: to search file contents
- Bash: for npm, running tests, dev server, etc.

For Mark2 operations, use the mark2_* MCP tools:
- mark2_save_artifact: save and register deliverables
- mark2_git_commit, mark2_git_push, mark2_git_sync: git operations
- mark2_signal_complete: signal phase completion
```

### Git Operations

```
You MUST use the Mark2 MCP tools for all git operations. DO NOT run git commands directly.

Check git status:
  mark2_git_status(task_id)

Commit changes:
  mark2_git_commit(task_id, message: "...")

Push to remote:
  mark2_git_push(task_id)

Sync with main:
  mark2_git_sync(task_id)
```

### Saving Artifacts

```
Use mark2_save_artifact to save artifacts. Just provide the filename you want —
it will be stored with a unique name like "{phase}-{filename}-{timestamp}-{random}.{ext}".

Examples:
  mark2_save_artifact(task_id, filename: "design.md", content: "# Design...")
  mark2_save_artifact(task_id, filename: "test-results.md", content: "...")

Always save artifacts BEFORE signaling phase completion.
```

### Phase-Specific Instructions

Each phase has specific instructions. For example, the **code_review** phase:

```
You are in the CODE REVIEW phase. Your job is to:
1. Get the diff: run `git diff $(git merge-base origin/HEAD HEAD)` to see all changes
2. Get context: use mark2_get_latest_artifact(task_id, "design") to read the design document
3. Review all changes for correctness, security issues, performance problems, and style violations
4. Classify issues by severity: P0 (must fix), P1 (should fix), P2 (nice to fix)
5. Save your review: mark2_save_artifact(task_id, filename: "review.md", content: "...")

If no fixes needed: mark2_signal_complete(task_id, token: "[REVIEW_COMPLETED]")
If fixes are required: mark2_signal_complete(task_id, token: "[REVIEW_NEEDS_FIXES]")
```

---

## Error Handling

All tools return errors in a consistent format:

```typescript
{
  content: [{ type: 'text', text: 'Error: Task TASK-999 not found' }],
  isError: true,
}
```

Common errors:
- **Task not found** - Invalid task ID
- **Artifact not found** - Artifact path doesn't exist
- **Clone does not exist** - Git clone hasn't been created yet
- **Git operation failed** - Merge conflicts, uncommitted changes, etc.

---

## Adding New Tools

To add a new MCP tool:

1. Edit `src/lib/mcp/server.ts`
2. Add a new `server.tool()` call:

```typescript
server.tool(
  'mark2_my_new_tool',           // Tool name
  'Description of what it does', // Description for AI
  {
    // Zod schema for parameters
    task_id: z.string().describe('The task ID'),
    my_param: z.string().describe('What this param does'),
  },
  async ({ task_id, my_param }) => {
    // Implementation
    return {
      content: [{ type: 'text' as const, text: 'Result' }],
    };
  },
);
```

3. Update agent instructions in `src/lib/orchestration/prompt-assembler.ts` if needed
4. Document the tool in this file

---

## Debugging

### Viewing Tool Calls

MCP tool calls are logged in the Mark2 activity log. Check the UI or:

```bash
cat .mark2/tasks/TASK-12.activity.yaml
```

### Testing Tools Manually

You can test the MCP server directly:

```bash
# Start the server with environment variables
MARK2_DIR=.mark2 MARK2_TASK_ID=TASK-1 MARK2_API_URL=http://localhost:3100 \
  npx tsx src/lib/mcp/index.ts
```

Then send JSON-RPC messages over stdin.

### Common Issues

1. **Tools not available** - Check that `--mcp-config` is being passed correctly
2. **Wrong task ID** - Ensure `MARK2_TASK_ID` matches the task being worked on
3. **API errors** - Verify Mark2 server is running at `MARK2_API_URL`
4. **Artifacts not saving** - Check `.mark2/storage/{task_id}/artifacts/` permissions
