# Mark2 CLI Commands

This document describes all the CLI commands available in Mark2 for managing your project, server, and agent sessions.

## Overview

Mark2 provides a command-line interface for initializing projects, managing the server, and controlling agent sessions. All commands are run via npm:

```bash
npm run mark2 <command> [arguments]
```

## Command Summary

| Command | Arguments | Description |
|---------|-----------|-------------|
| `init` | None | Initialize Mark2 in current directory |
| `start` | None | Start the Mark2 server |
| `stop` | None | Stop the Mark2 server |
| `status` | None | Show active agent sessions |
| `kill-sessions` | None | Kill all mark2 tmux sessions |
| `restart` | `<taskId> [phase]` | Restart or transition a task phase |
| `reindex` | None | Rebuild SQLite index from YAML |
| `tmuxes` | None | Interactive tmux session selector |

---

## Commands

### `init`

Initialize Mark2 in the current directory, setting up the complete project structure.

**Usage:**
```bash
npm run mark2 init
```

**What it does:**

1. **Checks dependencies** - Verifies `tmux` and `sqlite3` are installed
2. **Creates directory structure:**
   ```
   .mark2/
   ├── tasks/       # Task YAML files
   ├── stories/     # Story YAML files
   ├── artifacts/   # Legacy artifacts directory
   └── storage/     # Task-specific storage
   ```
3. **Creates configuration files from templates:**
   - `config.yaml` - Project settings
   - `agents.yaml` - Agent definitions
   - `context.json` - Project context for agents
4. **Initializes SQLite database** at `.mark2/mark2.db`
5. **Updates `.gitignore`** to exclude derived data

**Required System Dependencies:**
- `tmux` - For session management
- `sqlite3` - For database operations

**Example:**
```bash
cd my-project
npm run mark2 init
# Output:
# ✓ Created .mark2 directory structure
# ✓ Created config.yaml
# ✓ Created agents.yaml
# ✓ Created context.json
# ✓ Initialized database
# ✓ Updated .gitignore
# Mark2 initialized successfully!
```

---

### `start`

Start the Mark2 server (Next.js frontend + API backend + WebSocket server).

**Usage:**
```bash
npm run mark2 start
```

**What it does:**

1. Verifies `.mark2/` directory exists
2. Sets environment variables:
   - `MARK2_DIR` - Path to `.mark2` directory
   - `MARK2_PROJECT_DIR` - Project root directory
3. Starts the server with `npx tsx server.ts`
4. Streams server output to the terminal

**Default Port:** 3100 (configurable in `config.yaml`)

**Example:**
```bash
npm run mark2 start
# Output:
# Starting Mark2 server...
# Server running at http://localhost:3100
```

**Note:** The server must be running for:
- The web UI to work
- API endpoints to respond
- Agent phase transitions to process

---

### `stop`

Stop the Mark2 server gracefully.

**Usage:**
```bash
npm run mark2 stop
```

**What it does:**

1. Finds processes running `tsx server.ts`
2. Sends SIGTERM for graceful shutdown
3. Waits 1 second
4. If processes remain, sends SIGKILL

**Example:**
```bash
npm run mark2 stop
# Output:
# Stopping Mark2 server...
# Sent SIGTERM to process 12345
# Server stopped.
```

---

### `status`

Display active Mark2 agent sessions.

**Usage:**
```bash
npm run mark2 status
```

**What it does:**

1. Lists all tmux sessions starting with `mark2_`
2. Shows session names and count

**Session Naming Convention:** `mark2_{taskId}_{agentName}_{phase}`

**Example:**
```bash
npm run mark2 status
# Output:
# Active Mark2 sessions: 2
#   - mark2_TASK-1_claude-coder_coding
#   - mark2_TASK-2_claude-architect_design
```

---

### `kill-sessions`

Kill all Mark2 tmux sessions. Useful for cleanup or when sessions get stuck.

**Usage:**
```bash
npm run mark2 kill-sessions
```

**What it does:**

1. Lists all tmux sessions
2. Filters for sessions starting with `mark2_`
3. Kills each matching session
4. Reports which sessions were terminated

**Example:**
```bash
npm run mark2 kill-sessions
# Output:
# Killing mark2_TASK-1_claude-coder_coding
# Killing mark2_TASK-2_claude-architect_design
# Killed 2 sessions.
```

**Warning:** This will terminate any running agents. Use with caution during active work.

---

### `restart`

Restart the current phase or transition a task to a specific phase.

**Usage:**
```bash
npm run mark2 restart <taskId> [phase]
```

**Arguments:**
| Argument | Required | Description |
|----------|----------|-------------|
| `taskId` | Yes | The task ID (e.g., `TASK-5`) |
| `phase` | No | Target phase to transition to |

**Behavior:**

- **Without phase:** Restarts the current phase
  - Calls `POST /api/tasks/{taskId}/phase/restart`

- **With phase:** Transitions to the specified phase
  - Calls `PUT /api/tasks/{taskId}/phase` with the new phase

**Valid Phases:**
- `pending`
- `design`
- `coding`
- `testing`
- `code_review`
- `fix_review`
- `final_testing`
- `manual_testing`
- `done`

**Examples:**
```bash
# Restart the current phase
npm run mark2 restart TASK-5
# Output: Restarting current phase for TASK-5...

# Jump to a specific phase
npm run mark2 restart TASK-5 coding
# Output: Transitioning TASK-5 to coding phase...

# Force back to design
npm run mark2 restart TASK-5 design
# Output: Transitioning TASK-5 to design phase...
```

**Use Cases:**
- Agent crashed mid-phase
- Need to redo a phase with different approach
- Skip phases during development/testing
- Manually trigger phase transitions

---

### `reindex`

Rebuild the SQLite index from YAML files. The database is derived from YAML (source of truth).

**Usage:**
```bash
npm run mark2 reindex
```

**What it does:**

1. Re-initializes SQLite database structure
2. Scans and indexes all YAML files:
   - Tasks from `.mark2/tasks/*.yaml`
   - Stories from `.mark2/stories/*.yaml`
   - Activities from `.mark2/tasks/*.activity.yaml`
3. Reports indexing results

**Example:**
```bash
npm run mark2 reindex
# Output:
# Reindexing Mark2 database...
# Indexed 12 tasks
# Indexed 3 stories
# Indexed 47 activities
# Reindex complete.
```

**When to Use:**
- YAML files were edited manually
- Database appears out of sync
- After git operations that modified `.mark2/tasks/`
- Recovering from corruption

**Note:** This is safe to run anytime - it rebuilds from the authoritative YAML files.

---

### `tmuxes`

Interactive tmux session selector. Lists all sessions and lets you attach to one.

**Usage:**
```bash
npm run mark2 tmuxes
```

**What it does:**

1. Lists all active tmux sessions (not just Mark2 ones)
2. Shows session details:
   - Name
   - Number of windows
   - Attachment status
   - Dimensions
   - Age (e.g., "3h ago")
3. Presents interactive selection menu
4. Attaches to the selected session

**Display Format:**
```
[session_name]           [# windows]     (attached)     width×height    3h ago
```

**Example:**
```bash
npm run mark2 tmuxes
# Output:
# Select a tmux session to attach:
#
# 1. mark2_TASK-1_coding     2 windows   (detached)   180×50   5m ago
# 2. mark2_TASK-2_design     1 window    (detached)   180×50   2h ago
# 3. dev-server              3 windows   (attached)   200×60   1d ago
#
# Enter number (or 'q' to quit): 1
# [Attaches to session]
```

**Note:** Attaching takes over your terminal. Use `Ctrl+B D` to detach from tmux.

---

## Configuration

### config.yaml

The main configuration file created by `init`:

```yaml
project_name: "my-project"

# Server settings
server_port: 3100              # Mark2 API/UI port

# Port allocation for tasks
base_port: 3000                # Starting port for task allocation
ports_per_task: 10             # Ports allocated per task

# Git settings
merge_strategy: squash         # How to merge task branches

# Auto-fix settings by priority
auto_fix:
  P0: true                     # Auto-fix critical issues
  P1: false                    # Require approval for important
  P2: false                    # Require approval for minor

# Loop protection
max_loop_count: 5              # Max fix/review cycles before intervention

# Phase-specific settings
phase_defaults:
  design:
    timeout_minutes: 30
    auto_advance: false        # Require approval after design
  coding:
    timeout_minutes: 120
    auto_advance: true
  testing:
    timeout_minutes: 60
    auto_advance: true
  code_review:
    timeout_minutes: 30
    auto_advance: true
  manual_testing:
    timeout_minutes: 15
    auto_advance: false        # Require human testing
```

### agents.yaml

Defines the AI agents available for tasks:

```yaml
agents:
  - name: claude-architect
    cli_tool: claude-code
    model: claude-sonnet-4-20250514
    role_prompt: |
      You are an expert system architect...
    timeout_minutes: 30

  - name: claude-coder
    cli_tool: claude-code
    model: claude-sonnet-4-20250514
    role_prompt: |
      You are an expert full-stack developer...
    timeout_minutes: 120

  - name: claude-reviewer
    cli_tool: claude-code
    model: claude-sonnet-4-20250514
    role_prompt: |
      You are an expert code reviewer...
    timeout_minutes: 30
```

### context.json

Provides project context to agents:

```json
{
  "system_prompt": "You are working on a TypeScript project...",
  "api_endpoints": [...],
  "rules": [...]
}
```

---

## Typical Workflow

### Initial Setup

```bash
# 1. Initialize Mark2 in your project
cd my-project
npm run mark2 init

# 2. Start the server
npm run mark2 start

# 3. Open the UI
open http://localhost:3100
```

### During Development

```bash
# Check what's running
npm run mark2 status

# Attach to an agent session to watch it work
npm run mark2 tmuxes

# If an agent gets stuck, restart its phase
npm run mark2 restart TASK-5

# Kill all sessions if needed
npm run mark2 kill-sessions
```

### Maintenance

```bash
# If database seems out of sync
npm run mark2 reindex

# Stop the server when done
npm run mark2 stop
```

---

## Troubleshooting

### "Mark2 not initialized"

Run `npm run mark2 init` first.

### "tmux not found"

Install tmux:
```bash
# macOS
brew install tmux

# Ubuntu/Debian
sudo apt install tmux

# Arch
sudo pacman -S tmux
```

### "sqlite3 not found"

Install sqlite3:
```bash
# macOS
brew install sqlite

# Ubuntu/Debian
sudo apt install sqlite3

# Arch
sudo pacman -S sqlite
```

### Server won't start

1. Check if port 3100 is in use: `lsof -i :3100`
2. Check for existing server: `npm run mark2 stop`
3. Verify `.mark2/` directory exists

### Sessions not showing

1. Verify tmux is running: `tmux list-sessions`
2. Sessions may have completed - check the UI for task status

### Database out of sync

Run `npm run mark2 reindex` to rebuild from YAML files.

---

## Environment Variables

These are set automatically but can be overridden:

| Variable | Description | Default |
|----------|-------------|---------|
| `MARK2_DIR` | Path to .mark2 directory | `$PWD/.mark2` |
| `MARK2_PROJECT_DIR` | Project root | `$PWD` |
| `MARK2_API_URL` | API server URL | `http://localhost:3100` |

---

## See Also

- [MARK2_DIRECTORY.md](./MARK2_DIRECTORY.md) - Directory structure details
- [TASK_LIFECYCLE.md](./TASK_LIFECYCLE.md) - Task phases and transitions
- [CLI_ADAPTERS.md](./CLI_ADAPTERS.md) - How Mark2 invokes AI tools
- [MCP_SERVER.md](./MCP_SERVER.md) - MCP tools available to agents
