# The .mark2 Directory

This document describes the `.mark2` directory structure, how it's initialized, how data is stored, and how the various components work together.

## Overview

The `.mark2` directory is the heart of Mark2's state management. It lives at the root of your project and contains:

- **Configuration files** (YAML) - Human-readable, version-controllable settings
- **Task definitions** (YAML) - Individual task files with full history
- **SQLite database** - Fast indexed queries and runtime state
- **Clones** - Isolated git repositories for each active task
- **Storage** - Artifacts, prompts, and session data

## Directory Structure

```
.mark2/
├── config.yaml           # Project configuration
├── roles.yaml            # Role definitions (agent personalities)
├── agents.yaml           # Legacy agent definitions (deprecated)
├── mark2.db              # SQLite database
├── mark2.db-wal          # SQLite write-ahead log
├── mark2.db-shm          # SQLite shared memory
├── tasks/                # Task YAML files
│   ├── TASK-1.yaml
│   ├── TASK-1.activity.yaml
│   ├── TASK-2.yaml
│   └── ...
├── stories/              # Story YAML files (optional)
│   ├── STORY-1.yaml
│   └── ...
├── clones/               # Isolated git clones per task
│   ├── TASK-1/           # Full git clone for TASK-1
│   ├── TASK-12/          # Full git clone for TASK-12
│   └── ...
└── storage/              # Persistent storage per task
    ├── TASK-1/
    │   ├── artifacts/    # Design docs, test results, reviews
    │   ├── prompts/      # Saved prompts for each phase
    │   └── sessions/     # Session logs
    └── TASK-12/
        ├── artifacts/
        ├── prompts/
        └── sessions/
```

## Initialization

The `.mark2` directory is created automatically when Mark2 first runs. The initialization process:

1. **Creates the directory structure** - The root `.mark2` folder and subdirectories
2. **Initializes the SQLite database** - Creates all tables with proper indexes
3. **Sets up ID counters** - Initializes task and story ID sequences

### Database Initialization

The database is initialized lazily on first access. When `getDb()` is called:

```typescript
// From src/lib/db/index.ts
const sqliteDb = new Database(dbPath);
sqliteDb.pragma('journal_mode = WAL');  // Write-ahead logging for concurrency
sqliteDb.pragma('foreign_keys = ON');   // Referential integrity
```

Tables are created if they don't exist, and migrations are run to add any new columns.

## Data Storage Philosophy

Mark2 uses a **dual-storage strategy**:

| Data Type | YAML Files | SQLite Database |
|-----------|------------|-----------------|
| Tasks | Source of truth | Indexed cache |
| Stories | Source of truth | Indexed cache |
| Configuration | Source of truth | Not stored |
| Activity Logs | Source of truth | Indexed copy |
| Port Allocations | Not stored | Runtime only |
| Agent Sessions | Not stored | Runtime only |

### Why Dual Storage?

- **YAML files** are human-readable, git-friendly, and serve as the authoritative source
- **SQLite** provides fast queries, indexes, and handles high-frequency operations (activity logs, session tracking)

When data is modified, both storage locations are updated. On startup, SQLite is synchronized from YAML files.

---

## Configuration Files

### config.yaml

Project-wide settings including phase defaults, port allocation, and merge strategy.

```yaml
project_name: mark2
base_port: 3000
ports_per_task: 10
auto_fix:
  P0: true    # Auto-advance on P0 issues
  P1: false
  P2: false
phase_defaults:
  design:
    role: expert-system-architect
    cli_tool: claude-code
    model: claude-opus-4-5
    auto_advance: false
  coding:
    role: expert-fullstack-coder
    cli_tool: claude-code
    model: claude-sonnet-4-5
    auto_advance: false
  # ... other phases
max_loop_count: 5
server_port: 3100
merge_strategy: squash
```

**Schema** (`ConfigSchema` from `src/lib/yaml/schemas.ts`):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `project_name` | string | required | Project identifier |
| `base_port` | number | 3000 | Starting port for allocation |
| `ports_per_task` | number | 10 | Ports reserved per task |
| `auto_fix` | object | `{P0: true, P1: false, P2: false}` | Auto-advance by priority |
| `phase_defaults` | Record<string, PhaseDefault> | `{}` | Default role/cli/model per phase |
| `max_loop_count` | number | 5 | Max fix_review→code_review cycles |
| `server_port` | number | 3100 | Mark2 UI server port |
| `merge_strategy` | `squash` \| `preserve` | `squash` | Git merge strategy |
| `ide_commands` | string[] | `['code', 'cursor', 'windsurf']` | Available IDE commands |

### roles.yaml

Role definitions that describe agent personalities and capabilities.

```yaml
roles:
  - name: expert-system-architect
    uuid: 5291ff02-1512-4d6b-bbd3-1765771ed324
    description: Senior system architect for high-level design decisions
    role_prompt: |-
      You are an expert system architect with deep experience in distributed systems...
    suggested_phases:
      - design
    timeout_minutes: 90

  - name: expert-fullstack-coder
    uuid: 782fdb30-f26b-4746-94f9-3aa7d18177c8
    description: Senior full-stack developer for implementation
    role_prompt: |-
      You are an expert full-stack developer...
    suggested_phases:
      - coding
    timeout_minutes: 120
```

**Schema** (`RoleSchema` from `src/lib/yaml/schemas.ts`):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | required | Lowercase alphanumeric with hyphens |
| `uuid` | string | optional | Unique identifier |
| `description` | string | optional | Human-readable description |
| `role_prompt` | string | required | The personality/instructions for the agent |
| `suggested_phases` | Phase[] | `[]` | Phases this role is suited for |
| `timeout_minutes` | number | 60 | Maximum runtime for this role |

---

## Task Files

Each task has two YAML files:

### TASK-{id}.yaml

The task definition with full metadata and artifact history.

```yaml
id: TASK-1
title: Create an NPM task for tmux session selection
description: Create npm run mark2 tmuxes that shows all tmux sessions...
phase: done
phase_agents: {}
phase_overrides: {}
blockers: []
priority: P2
artifacts:
  - name: design
    phase: design
    path: design-design-1769816635481-ks6rty.md
    mime_type: text/markdown
    created_at: 2026-01-30T23:43:55.482Z
  - name: test-results
    phase: testing
    path: testing-test-results-1769830269844-98juta.md
    mime_type: text/markdown
    created_at: 2026-01-31T03:31:09.845Z
ports: []
worktrees: {}
created_by: human
merge_strategy: squash
auto_advance: true
auto_approve: false
created_at: 2026-01-30T22:57:40.856Z
updated_at: 2026-01-31T18:31:23.068Z
phase_entered_at: 2026-01-31T18:31:23.068Z
loop_count: 0
```

**Schema** (`TaskSchema` from `src/lib/yaml/schemas.ts`):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | string | required | Format: `TASK-{number}` |
| `title` | string | required | 1-200 characters |
| `description` | string | required | Full task description |
| `phase` | Phase | `pending` | Current phase |
| `phase_overrides` | Record<string, Override> | `{}` | Per-phase role/cli/model overrides |
| `blockers` | string[] | `[]` | Blocking task IDs |
| `priority` | `P0`-`P3` | `P2` | Task priority |
| `artifacts` | TaskArtifact[] | `[]` | Generated artifacts |
| `ports` | number[] | `[]` | Allocated ports |
| `worktrees` | Record<string, string> | `{}` | Legacy worktree paths |
| `created_by` | string | required | Creator identifier |
| `story_id` | string | optional | Parent story ID |
| `parent_task` | string | optional | Parent task ID |
| `merge_strategy` | `squash` \| `preserve` | `squash` | Git merge strategy |
| `auto_advance` | boolean | `true` | Auto-advance through phases |
| `auto_approve` | boolean | `false` | Auto-approve phase transitions |
| `created_at` | ISO datetime | required | Creation timestamp |
| `updated_at` | ISO datetime | required | Last update timestamp |
| `phase_entered_at` | ISO datetime | required | Current phase start time |
| `loop_count` | number | 0 | fix_review→code_review cycles |

### TASK-{id}.activity.yaml

Activity log for the task, tracking all events.

```yaml
task_id: TASK-1
entries:
  - timestamp: 2026-01-30T23:43:55.000Z
    source: orchestration
    type: phase_change
    message: 'Design phase started. Agent "expert-system-architect" spawned.'
    metadata:
      agent: expert-system-architect
      tmux_session: mark2-TASK-1-design
  - timestamp: 2026-01-30T23:50:19.000Z
    source: agent
    type: artifact
    message: 'Design document saved'
```

**Phases** (from `Phase` enum):
- `pending` - Not started
- `design` - Architecture and design
- `coding` - Implementation
- `testing` - Automated testing
- `code_review` - Code review
- `fix_review` - Fixing review issues
- `final_testing` - Final test run
- `manual_testing` - Human QA
- `done` - Completed

---

## SQLite Database

The `mark2.db` file provides fast indexed access to task data. It uses WAL (Write-Ahead Logging) for concurrent access.

### Tables

#### tasks
Primary task storage with JSON columns for complex fields.

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'P2',
  story_id TEXT,
  parent_task TEXT,
  created_by TEXT NOT NULL,
  merge_strategy TEXT NOT NULL DEFAULT 'squash',
  auto_advance INTEGER NOT NULL DEFAULT 1,
  auto_approve INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  phase_entered_at TEXT NOT NULL,
  loop_count INTEGER NOT NULL DEFAULT 0,
  phase_agents_json TEXT NOT NULL DEFAULT '{}',
  phase_overrides_json TEXT NOT NULL DEFAULT '{}',
  blockers_json TEXT NOT NULL DEFAULT '[]',
  artifacts_json TEXT NOT NULL DEFAULT '[]',
  ports_json TEXT NOT NULL DEFAULT '[]',
  worktrees_json TEXT NOT NULL DEFAULT '{}'
);
```

#### activity_entries
High-frequency activity logging.

```sql
CREATE TABLE activity_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  source TEXT NOT NULL,      -- 'agent', 'orchestration', 'git', 'user'
  type TEXT NOT NULL,        -- 'note', 'phase_change', 'artifact', 'error', 'comment'
  message TEXT NOT NULL,
  metadata_json TEXT
);
```

#### agent_sessions
Tracks running agent processes.

```sql
CREATE TABLE agent_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  phase TEXT NOT NULL,
  tmux_session TEXT NOT NULL,
  pid INTEGER,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  exit_code INTEGER,
  status TEXT NOT NULL DEFAULT 'running'  -- 'running', 'completed', 'failed'
);
```

#### port_allocations
Runtime port assignments.

```sql
CREATE TABLE port_allocations (
  task_id TEXT PRIMARY KEY,
  ports_json TEXT NOT NULL,
  services_json TEXT NOT NULL DEFAULT '{}',
  allocated_at TEXT NOT NULL
);
```

#### id_counters
Auto-incrementing ID sequences.

```sql
CREATE TABLE id_counters (
  entity_type TEXT PRIMARY KEY,  -- 'task', 'story'
  next_id INTEGER NOT NULL DEFAULT 1
);
```

---

## Clones and Isolation

Each active task gets its own **isolated git clone** in `.mark2/clones/{TASK-ID}/`.

### Why Clones?

1. **Isolation** - Each task works in its own directory without affecting others
2. **Branch Management** - Each clone has its own branch (`mark2/{TASK-ID}`)
3. **Parallel Work** - Multiple tasks can run simultaneously
4. **Clean State** - Agents start with a clean working directory
5. **Easy Cleanup** - Delete the clone when done

### Clone Lifecycle

```
1. Task Created (pending)
   └── No clone yet

2. Phase Started (design/coding/etc)
   └── Clone created: .mark2/clones/TASK-12/
       ├── Full git repository
       ├── Branch: mark2/TASK-12
       └── Origin: file:// to main repo

3. Agent Works
   └── Makes changes in clone
   └── Commits to mark2/TASK-12 branch

4. Task Completed (done)
   └── Branch merged to main (squash or preserve)
   └── Clone can be deleted
```

### Clone Service

The `CloneService` (`src/lib/services/clone-service.ts`) manages clones:

```typescript
// Create a clone
await cloneService.createClone('TASK-12');
// Returns: { taskId, clonePath, branchName, createdAt, status }

// Get clone path
cloneService.getClonePath('TASK-12');
// Returns: /path/to/project/.mark2/clones/TASK-12

// Get branch name
cloneService.getBranchName('TASK-12');
// Returns: mark2/TASK-12

// Commit changes
await cloneService.commit('TASK-12', 'Implement feature X');

// Push to origin
await cloneService.push('TASK-12');

// Sync with main
await cloneService.sync('TASK-12');  // fetch + rebase

// Get diff
await cloneService.getDiff('TASK-12');  // All changes from origin/main
```

---

## Storage Directory

The `.mark2/storage/{TASK-ID}/` directory contains **persistent data** that survives clone deletion.

### Structure

```
.mark2/storage/TASK-1/
├── artifacts/           # Generated artifacts
│   ├── design-design-1769816635481-ks6rty.md
│   ├── testing-test-results-1769830269844-98juta.md
│   └── code_review-review-1769831049550-r95w9y.md
├── prompts/             # Saved prompts for debugging
│   ├── design-orchestration.md
│   ├── design-agent.md
│   ├── design-task.md
│   └── ...
└── sessions/            # Session logs (optional)
```

### Artifact Naming

Artifacts are named with the pattern:
```
{phase}-{name}-{timestamp}-{random}.{ext}
```

Example: `code_review-review-1769831049550-r95w9y.md`

- `code_review` - Phase when created
- `review` - Artifact name
- `1769831049550` - Unix timestamp (ms)
- `r95w9y` - Random suffix for uniqueness
- `.md` - File extension

### Why Storage is Separate from Clones

**Clones are ephemeral** - They're deleted when a task completes.

**Storage is permanent** - Artifacts, prompts, and logs persist for:
- Historical review
- Debugging failed phases
- Audit trails
- UI display after task completion

This is why artifacts are stored in `.mark2/storage/` rather than inside clones.

---

## Synchronization

### YAML → SQLite

On startup and when YAML files are modified:

```typescript
// YamlReader reads the file
const { data: task } = reader.readTask('TASK-1');

// TaskService updates SQLite
taskService.upsert(task);
```

### SQLite → YAML

When task state changes via API:

```typescript
// TaskService updates both
taskService.updatePhase('TASK-1', 'coding');
// 1. Updates SQLite (fast, for queries)
// 2. Updates YAML (durable, for git)
```

### Conflict Resolution

YAML files are the source of truth. If SQLite and YAML disagree:
- YAML wins
- SQLite is re-synchronized from YAML
- Corrupt file detection is logged to `corrupt_files` table

---

## Git Integration

The `.mark2` directory is designed to be **partially version-controlled**:

### Should be committed (.gitignore patterns)
```
# Commit these
.mark2/config.yaml
.mark2/roles.yaml
.mark2/tasks/*.yaml
.mark2/stories/*.yaml
```

### Should NOT be committed
```
# .gitignore
.mark2/mark2.db*         # Runtime database
.mark2/clones/           # Ephemeral working directories
.mark2/storage/          # Large artifacts, prompts
```

This allows:
- **Configuration** to be shared across team
- **Task definitions** to track what work was done
- **Runtime state** to remain local
- **Clones** to be recreated as needed
