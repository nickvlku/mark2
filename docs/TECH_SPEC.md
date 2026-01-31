# Mark2 Technical Specification

> Translates the [PRD](./PRD.md) into concrete implementation details for the Mark2 Agentic Software Development Orchestrator.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Project Structure](#2-project-structure)
3. [Data Layer](#3-data-layer)
4. [API Design](#4-api-design)
5. [Pipeline Engine](#5-pipeline-engine)
6. [Agent Orchestration](#6-agent-orchestration)
7. [Git Worktree Management](#7-git-worktree-management)
8. [UI Components](#8-ui-components)
9. [Configuration](#9-configuration)
10. [Error Handling & Resilience](#10-error-handling--resilience)
11. [Build Sequence](#11-build-sequence)

---

## 1. System Architecture

### 1.1 High-Level Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Next.js Unified Server                           │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  React UI    │  │  REST API    │  │  MCP Server  │  │  WebSocket   │  │
│  │  (App Router)│  │  (API Routes)│  │  (Embedded)  │  │  Server      │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └───────┬──────┘  │
│         │                 │                 │                  │         │
│         └────────┬────────┴────────┬────────┘                  │         │
│                  ▼                 ▼                           │         │
│          ┌──────────────────────────────┐                      │         │
│          │       Service Layer          │◄─────────────────────┘         │
│          │  (TaskService, StoryService, │                                │
│          │   AgentService, PortService, │                                │
│          │   WorktreeService)           │                                │
│          └──────────┬──────────────┬────┘                                │
│                     │              │                                     │
│          ┌──────────▼──────┐  ┌────▼─────────────┐                       │
│          │  Data Layer     │  │  Orchestration   │                       │
│          │  (Drizzle/SQLite│  │  Engine          │                       │
│          │   + YAML files) │  │  (Pipeline FSM)  │                       │
│          └─────────────────┘  └────────┬─────────┘                       │
│                                        │                                 │
└────────────────────────────────────────┼─────────────────────────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
              ┌─────▼─────┐       ┌─────▼─────┐       ┌─────▼─────┐
              │ TMUX      │       │ TMUX      │       │ TMUX      │
              │ Session A │       │ Session B │       │ Session C │
              │ (Claude)  │       │ (Codex)   │       │ (Gemini)  │
              └───────────┘       └───────────┘       └───────────┘
```

### 1.2 Process Model

| Process | Description |
|---------|-------------|
| **Next.js server** | Single Node.js process. Serves React UI, API routes, embedded MCP server, WebSocket server, and orchestration engine. Runs on a user-configured port (default `3100`). |
| **TMUX sessions** | Child processes spawned by the orchestration engine. Each agent invocation runs inside a named TMUX session. The server monitors these sessions for end tokens and exit codes. |
| **SQLite** | In-process via `better-sqlite3`. WAL mode for concurrent read access from API handlers while the orchestration engine writes. No external database process. |

### 1.3 Communication Flows

| Flow | Protocol | Description |
|------|----------|-------------|
| UI ↔ API | HTTP (REST) | React client calls Next.js API routes for all CRUD operations. Standard `fetch` with SWR or React Query for caching/revalidation. |
| UI ↔ WebSocket | WS | Real-time board updates (task phase changes, activity feed) and terminal streaming (xterm.js ↔ TMUX). Single WebSocket endpoint upgraded from the Next.js server. |
| Agent ↔ MCP | stdio | CLI tools that support MCP (e.g., Claude Code) connect to the embedded MCP server. The server exposes Mark2 tools (create_task, report_artifact, etc.) over the MCP protocol. |
| Agent ↔ REST | HTTP | CLI tools without MCP support (or scripts) call the REST API directly. The agent receives the API base URL in its prompt context. |
| Orchestrator ↔ TMUX | `tmux` CLI | The orchestration engine spawns TMUX sessions via `tmux new-session`, monitors output via `tmux capture-pane`, and detects end tokens by polling captured output. |

---

## 2. Project Structure

```
mark2/
├── package.json
├── tsconfig.json
├── next.config.ts
├── drizzle.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── .env.example
│
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout (dark theme, fonts)
│   │   ├── page.tsx                  # Board view (main page)
│   │   ├── settings/
│   │   │   └── page.tsx              # Agent configuration, project settings
│   │   ├── ports/
│   │   │   └── page.tsx              # Port dashboard
│   │   └── api/
│   │       ├── tasks/
│   │       │   ├── route.ts          # GET (list), POST (create)
│   │       │   └── [id]/
│   │       │       ├── route.ts      # GET, PATCH, DELETE
│   │       │       ├── blockers/
│   │       │       │   └── route.ts  # POST (add), DELETE (remove)
│   │       │       ├── artifacts/
│   │       │       │   └── route.ts  # POST (report artifact)
│   │       │       ├── activity/
│   │       │       │   └── route.ts  # GET, POST
│   │       │       └── phase/
│   │       │           └── route.ts  # POST (signal phase complete), GET (phase context)
│   │       ├── stories/
│   │       │   ├── route.ts          # GET (list), POST (create)
│   │       │   └── [id]/
│   │       │       ├── route.ts      # GET, PATCH, DELETE
│   │       │       └── tasks/
│   │       │           └── route.ts  # POST (add task), DELETE (remove task)
│   │       ├── ports/
│   │       │   └── route.ts          # GET (list), POST (allocate), DELETE (release)
│   │       ├── worktrees/
│   │       │   └── route.ts          # GET (list), POST (create), DELETE
│   │       ├── agents/
│   │       │   └── route.ts          # GET (list), PUT (update definitions)
│   │       ├── config/
│   │       │   └── route.ts          # GET, PUT (project config)
│   │       └── ws/
│   │           └── route.ts          # WebSocket upgrade endpoint
│   │
│   ├── lib/
│   │   ├── db/
│   │   │   ├── schema.ts            # Drizzle ORM schema definitions
│   │   │   ├── index.ts             # Database connection (better-sqlite3 + Drizzle)
│   │   │   ├── migrations/          # Drizzle migration files
│   │   │   └── seed.ts              # Optional seed data for development
│   │   │
│   │   ├── services/
│   │   │   ├── task-service.ts       # Task CRUD, phase transitions, blocker resolution
│   │   │   ├── story-service.ts      # Story CRUD, task association
│   │   │   ├── agent-service.ts      # Agent definition management
│   │   │   ├── port-service.ts       # Port allocation/deallocation
│   │   │   ├── worktree-service.ts   # Git worktree lifecycle
│   │   │   ├── artifact-service.ts   # Artifact storage and retrieval
│   │   │   ├── activity-service.ts   # Activity log management
│   │   │   ├── config-service.ts     # Project configuration
│   │   │   └── reindex-service.ts    # YAML → SQLite reindex logic
│   │   │
│   │   ├── orchestration/
│   │   │   ├── engine.ts             # Main orchestration engine (singleton)
│   │   │   ├── pipeline.ts           # Phase state machine definitions
│   │   │   ├── phase-handlers/
│   │   │   │   ├── pending.ts        # Pending phase handler
│   │   │   │   ├── design.ts         # Design phase handler
│   │   │   │   ├── coding.ts         # Coding phase handler
│   │   │   │   ├── testing.ts        # Testing phase handler
│   │   │   │   ├── code-review.ts    # Code review phase handler
│   │   │   │   ├── manual-testing.ts # Manual testing phase handler
│   │   │   │   └── done.ts           # Done phase handler (merge + cleanup)
│   │   │   ├── tmux-manager.ts       # TMUX session lifecycle
│   │   │   ├── end-token-watcher.ts  # Polls TMUX output for end tokens
│   │   │   └── prompt-assembler.ts   # 4-layer prompt construction
│   │   │
│   │   ├── adapters/
│   │   │   ├── types.ts              # CLIAdapter interface definition
│   │   │   ├── claude-code.ts        # Claude Code CLI adapter
│   │   │   ├── codex-cli.ts          # Codex CLI adapter
│   │   │   ├── gemini-cli.ts         # Gemini CLI adapter
│   │   │   └── opencode.ts           # OpenCode CLI adapter
│   │   │
│   │   ├── mcp/
│   │   │   ├── server.ts             # MCP server setup (tools registration)
│   │   │   └── tools.ts              # MCP tool definitions (mapped to service layer)
│   │   │
│   │   ├── ws/
│   │   │   ├── server.ts             # WebSocket server setup
│   │   │   ├── events.ts             # Event type definitions
│   │   │   └── terminal-bridge.ts    # TMUX ↔ xterm.js bridge
│   │   │
│   │   ├── yaml/
│   │   │   ├── schemas.ts            # Zod schemas for all YAML entities
│   │   │   ├── reader.ts             # YAML file reader with Zod validation
│   │   │   └── writer.ts             # YAML file writer (write + git add)
│   │   │
│   │   └── utils/
│   │       ├── id-generator.ts       # Sequential ID generation (TASK-N, STORY-N)
│   │       ├── port-allocator.ts     # Deterministic port allocation formula
│   │       ├── git.ts                # Git command helpers (worktree, branch, merge)
│   │       └── tmux.ts               # Low-level TMUX command wrappers
│   │
│   ├── components/
│   │   ├── board/
│   │   │   ├── Board.tsx             # Main board layout (columns)
│   │   │   ├── Column.tsx            # Phase column with drop target
│   │   │   ├── Card.tsx              # Task card (draggable)
│   │   │   ├── CardBadges.tsx        # Priority, agent, status badges
│   │   │   └── StoryFilter.tsx       # Story filter dropdown
│   │   │
│   │   ├── detail/
│   │   │   ├── TaskDetail.tsx        # Task detail panel (slide-over)
│   │   │   ├── PhaseTimeline.tsx     # Visual phase progression
│   │   │   ├── ArtifactsTab.tsx      # Artifact viewer (markdown, images)
│   │   │   ├── ActivityTab.tsx       # Activity feed
│   │   │   ├── CodeTab.tsx           # Git diff viewer
│   │   │   ├── TerminalTab.tsx       # xterm.js terminal
│   │   │   └── BakeoffTab.tsx        # Side-by-side comparison
│   │   │
│   │   ├── settings/
│   │   │   ├── AgentEditor.tsx       # Agent CRUD form
│   │   │   ├── PhaseDefaults.tsx     # Default agent per phase
│   │   │   └── AutoFixConfig.tsx     # P0/P1/P2 auto-fix toggles
│   │   │
│   │   ├── shared/
│   │   │   ├── Dialog.tsx            # Confirmation dialogs
│   │   │   ├── MarkdownRenderer.tsx  # Render markdown artifacts
│   │   │   ├── Badge.tsx             # Reusable badge component
│   │   │   └── ActionBar.tsx         # Phase-specific action buttons
│   │   │
│   │   └── create/
│   │       ├── CreateTaskDialog.tsx   # New task form
│   │       └── CreateStoryDialog.tsx  # New story form
│   │
│   ├── hooks/
│   │   ├── useWebSocket.ts          # WebSocket connection + event handlers
│   │   ├── useTasks.ts              # Task data fetching + mutations (SWR)
│   │   ├── useStories.ts            # Story data fetching + mutations
│   │   └── useTerminal.ts           # xterm.js + WebSocket terminal hook
│   │
│   └── types/
│       └── index.ts                  # Shared TypeScript types (derived from Zod)
│
├── cli/
│   ├── index.ts                      # CLI entry point (mark2 command)
│   ├── commands/
│   │   ├── init.ts                   # mark2 init
│   │   ├── start.ts                  # mark2 start (launch server)
│   │   ├── reindex.ts                # mark2 reindex
│   │   └── status.ts                 # mark2 status (show running agents)
│   └── templates/
│       ├── config.yaml               # Default config template
│       ├── agents.yaml               # Default agents template
│       └── context.json              # Default context manifest template
│
├── public/
│   └── favicon.ico
│
└── tests/
    ├── unit/
    │   ├── services/
    │   ├── orchestration/
    │   └── yaml/
    ├── integration/
    │   ├── api/
    │   └── pipeline/
    └── e2e/
        └── board.spec.ts
```

---

## 3. Data Layer

### 3.1 Zod Schemas

All YAML entities are validated with Zod. These schemas are the single source of truth for both runtime validation and TypeScript types.

```typescript
// src/lib/yaml/schemas.ts

import { z } from "zod";

// ── Enums ──────────────────────────────────────────────────────────────

export const Phase = z.enum([
  "pending",
  "design",
  "coding",
  "testing",
  "code_review",
  "manual_testing",
  "done",
]);
export type Phase = z.infer<typeof Phase>;

export const Priority = z.enum(["P0", "P1", "P2", "P3"]);
export type Priority = z.infer<typeof Priority>;

export const StoryStatus = z.enum(["pending", "in_progress", "completed"]);
export type StoryStatus = z.infer<typeof StoryStatus>;

export const MergeStrategy = z.enum(["squash", "preserve"]);
export type MergeStrategy = z.infer<typeof MergeStrategy>;

export const ReviewSeverity = z.enum(["P0", "P1", "P2"]);
export type ReviewSeverity = z.infer<typeof ReviewSeverity>;

// ── Agent Definition ───────────────────────────────────────────────────

export const AgentDefinition = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/, "Agent names must be lowercase alphanumeric with hyphens"),
  cli_tool: z.enum(["claude-code", "codex-cli", "gemini-cli", "opencode"]),
  model: z.string(),                    // e.g. "claude-sonnet-4-20250514", "o3", "gemini-2.5-pro"
  role_prompt: z.string(),              // Personality/expertise prompt
  timeout_minutes: z.number().int().positive().default(60),
});
export type AgentDefinition = z.infer<typeof AgentDefinition>;

// ── Task ───────────────────────────────────────────────────────────────

export const TaskArtifact = z.object({
  name: z.string(),                     // e.g. "TASK-42_design.md"
  phase: Phase,
  path: z.string(),                     // Relative to .mark2/artifacts/
  mime_type: z.string().optional(),
  created_at: z.string().datetime(),
});
export type TaskArtifact = z.infer<typeof TaskArtifact>;

export const TaskSchema = z.object({
  id: z.string().regex(/^TASK-\d+$/),
  title: z.string().min(1).max(200),
  description: z.string(),
  phase: Phase.default("pending"),
  assigned_agents: z.array(z.string()).default([]),     // Agent names (references to agents.yaml)
  blockers: z.array(z.string()).default([]),             // Task IDs this is blocked by
  priority: Priority.default("P2"),
  artifacts: z.array(TaskArtifact).default([]),
  ports: z.array(z.number().int()).default([]),
  worktrees: z.record(z.string(), z.string()).default({}),  // agent_name → worktree_path
  created_by: z.string(),                                // "human" or agent name
  story_id: z.string().regex(/^STORY-\d+$/).optional(),
  parent_task: z.string().regex(/^TASK-\d+$/).optional(),
  merge_strategy: MergeStrategy.default("squash"),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  phase_entered_at: z.string().datetime(),               // When current phase started
  loop_count: z.number().int().default(0),               // Times looped back to coding
});
export type Task = z.infer<typeof TaskSchema>;

// ── Activity Log Entry ─────────────────────────────────────────────────

export const ActivityEntry = z.object({
  timestamp: z.string().datetime(),
  source: z.string(),                   // "human", agent name, or "system"
  type: z.enum(["note", "phase_change", "artifact", "error", "comment"]),
  message: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ActivityEntry = z.infer<typeof ActivityEntry>;

export const ActivityLog = z.object({
  task_id: z.string().regex(/^TASK-\d+$/),
  entries: z.array(ActivityEntry).default([]),
});
export type ActivityLog = z.infer<typeof ActivityLog>;

// ── Story ──────────────────────────────────────────────────────────────

export const StorySchema = z.object({
  id: z.string().regex(/^STORY-\d+$/),
  title: z.string().min(1).max(200),
  description: z.string(),
  tasks: z.array(z.string()).default([]),  // Task IDs
  created_by: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Story = z.infer<typeof StorySchema>;

// ── Project Config ─────────────────────────────────────────────────────

export const PhaseConfig = z.object({
  default_agent: z.string().optional(),          // Agent name
  timeout_minutes: z.number().int().positive().default(60),
  auto_advance: z.boolean().default(false),      // Auto-move to next phase on completion
});

export const ConfigSchema = z.object({
  project_name: z.string(),
  base_port: z.number().int().default(3000),
  ports_per_task: z.number().int().default(10),
  auto_fix: z.object({
    P0: z.boolean().default(true),               // Always auto-fix critical
    P1: z.boolean().default(false),
    P2: z.boolean().default(false),
  }).default({}),
  phase_defaults: z.record(Phase, PhaseConfig).default({}),
  max_loop_count: z.number().int().default(5),   // Max coding↔testing loops before flagging
  server_port: z.number().int().default(3100),
  merge_strategy: MergeStrategy.default("squash"),
});
export type Config = z.infer<typeof ConfigSchema>;
```

### 3.2 YAML File Format Examples

**Task file** (`.mark2/tasks/TASK-42.yaml`):

```yaml
id: TASK-42
title: Add user authentication endpoint
description: |
  Implement POST /api/auth/login and POST /api/auth/register endpoints
  with JWT token generation. Must support email/password authentication.

  Acceptance criteria:
  - Login returns JWT on valid credentials
  - Register creates user and returns JWT
  - Invalid credentials return 401
  - Duplicate email returns 409
phase: coding
assigned_agents:
  - claude-python-pro
blockers:
  - TASK-40
priority: P1
artifacts:
  - name: TASK-42_design.md
    phase: design
    path: TASK-42/design/TASK-42_design.md
    created_at: "2025-06-01T10:30:00Z"
ports: [3420, 3421, 3422, 3423, 3424, 3425, 3426, 3427, 3428, 3429]
worktrees:
  claude-python-pro: /home/user/projects/myapp_TASK-42
created_by: human
story_id: STORY-7
merge_strategy: squash
created_at: "2025-06-01T09:00:00Z"
updated_at: "2025-06-01T14:22:00Z"
phase_entered_at: "2025-06-01T12:00:00Z"
loop_count: 0
```

**Activity log** (`.mark2/tasks/TASK-42.activity.yaml`):

```yaml
task_id: TASK-42
entries:
  - timestamp: "2025-06-01T09:00:00Z"
    source: human
    type: phase_change
    message: "Task created"
  - timestamp: "2025-06-01T10:00:00Z"
    source: system
    type: phase_change
    message: "Moved to design"
  - timestamp: "2025-06-01T10:30:00Z"
    source: claude-architect
    type: artifact
    message: "Design document created: TASK-42_design.md"
    metadata:
      artifact_path: "TASK-42/design/TASK-42_design.md"
  - timestamp: "2025-06-01T11:00:00Z"
    source: claude-architect
    type: note
    message: "Found existing auth module at src/auth/ — will extend rather than replace"
  - timestamp: "2025-06-01T12:00:00Z"
    source: human
    type: phase_change
    message: "Design approved, moved to coding"
```

**Story file** (`.mark2/stories/STORY-7.yaml`):

```yaml
id: STORY-7
title: User authentication system
description: |
  Implement complete user authentication including login, registration,
  password reset, and session management.
tasks:
  - TASK-40
  - TASK-41
  - TASK-42
  - TASK-43
created_by: human
created_at: "2025-06-01T08:00:00Z"
updated_at: "2025-06-01T09:00:00Z"
```

### 3.3 Drizzle ORM Schema (SQLite Index)

```typescript
// src/lib/db/schema.ts

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// ── Tasks table ────────────────────────────────────────────────────────

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),                           // "TASK-42"
  title: text("title").notNull(),
  description: text("description").notNull(),
  phase: text("phase").notNull().default("pending"),     // Phase enum value
  priority: text("priority").notNull().default("P2"),
  story_id: text("story_id"),
  parent_task: text("parent_task"),
  created_by: text("created_by").notNull(),
  merge_strategy: text("merge_strategy").notNull().default("squash"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  phase_entered_at: text("phase_entered_at").notNull(),
  loop_count: integer("loop_count").notNull().default(0),
  // Denormalized JSON fields for fast reads (arrays stored as JSON strings)
  assigned_agents_json: text("assigned_agents_json").notNull().default("[]"),
  blockers_json: text("blockers_json").notNull().default("[]"),
  artifacts_json: text("artifacts_json").notNull().default("[]"),
  ports_json: text("ports_json").notNull().default("[]"),
  worktrees_json: text("worktrees_json").notNull().default("{}"),
}, (table) => [
  index("idx_tasks_phase").on(table.phase),
  index("idx_tasks_priority").on(table.priority),
  index("idx_tasks_story_id").on(table.story_id),
  index("idx_tasks_parent_task").on(table.parent_task),
]);

// ── Stories table ──────────────────────────────────────────────────────

export const stories = sqliteTable("stories", {
  id: text("id").primaryKey(),                           // "STORY-7"
  title: text("title").notNull(),
  description: text("description").notNull(),
  created_by: text("created_by").notNull(),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  tasks_json: text("tasks_json").notNull().default("[]"),
});

// ── Activity entries table ─────────────────────────────────────────────

export const activity_entries = sqliteTable("activity_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  task_id: text("task_id").notNull(),
  timestamp: text("timestamp").notNull(),
  source: text("source").notNull(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  metadata_json: text("metadata_json"),
}, (table) => [
  index("idx_activity_task_id").on(table.task_id),
  index("idx_activity_timestamp").on(table.timestamp),
]);

// ── Port allocations table (runtime only, not synced to YAML) ──────────

export const port_allocations = sqliteTable("port_allocations", {
  task_id: text("task_id").primaryKey(),
  ports_json: text("ports_json").notNull(),              // JSON array of port numbers
  services_json: text("services_json").notNull().default("{}"), // { port: description }
  allocated_at: text("allocated_at").notNull(),
});

// ── Worktree records table (runtime only, not synced to YAML) ──────────

export const worktree_records = sqliteTable("worktree_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  task_id: text("task_id").notNull(),
  agent_name: text("agent_name").notNull(),
  worktree_path: text("worktree_path").notNull(),
  branch_name: text("branch_name").notNull(),
  created_at: text("created_at").notNull(),
  status: text("status").notNull().default("active"),    // "active" | "merged" | "cleanup_pending"
}, (table) => [
  index("idx_worktrees_task_id").on(table.task_id),
  index("idx_worktrees_status").on(table.status),
]);

// ── Agent TMUX sessions table (runtime only) ───────────────────────────

export const agent_sessions = sqliteTable("agent_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  task_id: text("task_id").notNull(),
  agent_name: text("agent_name").notNull(),
  phase: text("phase").notNull(),
  tmux_session: text("tmux_session").notNull(),          // TMUX session name
  pid: integer("pid"),                                    // Process ID
  started_at: text("started_at").notNull(),
  ended_at: text("ended_at"),
  exit_code: integer("exit_code"),
  status: text("status").notNull().default("running"),   // "running" | "completed" | "failed" | "timeout"
}, (table) => [
  index("idx_sessions_task_id").on(table.task_id),
  index("idx_sessions_status").on(table.status),
]);

// ── ID counters table ──────────────────────────────────────────────────

export const id_counters = sqliteTable("id_counters", {
  entity_type: text("entity_type").primaryKey(),          // "task" | "story"
  next_id: integer("next_id").notNull().default(1),
});

// ── Corrupt files tracking ─────────────────────────────────────────────

export const corrupt_files = sqliteTable("corrupt_files", {
  file_path: text("file_path").primaryKey(),
  error_message: text("error_message").notNull(),
  detected_at: text("detected_at").notNull(),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
});
```

### 3.4 Reindex Logic

```typescript
// src/lib/services/reindex-service.ts — conceptual interface

interface ReindexService {
  /** Full rebuild: drop all derived rows, re-parse all YAML files.
   *  Called on startup and `mark2 reindex`. */
  fullReindex(): Promise<ReindexResult>;

  /** Incremental: re-parse only changed YAML files.
   *  Called after git pull detection or file watcher events. */
  incrementalReindex(changedFiles: string[]): Promise<ReindexResult>;
}

interface ReindexResult {
  tasks_indexed: number;
  stories_indexed: number;
  activities_indexed: number;
  errors: ParseError[];       // Files that failed validation
}

interface ParseError {
  file_path: string;
  error: string;              // Zod validation error message
  preserved: boolean;         // true = last known good state kept in SQLite
}
```

**Reindex sequence:**

1. **Full reindex** (startup / manual):
   - Glob `.mark2/tasks/TASK-*.yaml` — parse each with `TaskSchema`, insert into `tasks` table
   - Glob `.mark2/tasks/TASK-*.activity.yaml` — parse each with `ActivityLog`, insert into `activity_entries`
   - Glob `.mark2/stories/STORY-*.yaml` — parse each with `StorySchema`, insert into `stories`
   - Scan the `next_id` counters by finding max existing IDs
   - Any file that fails Zod validation: log error, add to `corrupt_files`, skip entity, preserve last known good state

2. **Incremental reindex** (post-pull / file watcher):
   - Receive list of changed file paths
   - For each changed `.yaml` file: re-parse and upsert into SQLite
   - For deleted files: remove from SQLite
   - Validation failures handled same as full reindex

### 3.5 Parse Failure Handling Flow

```
YAML file fails Zod validation
        │
        ▼
  ┌──────────────┐
  │ Log error to │──▶ Insert into corrupt_files table
  │ console/UI   │    (file_path, error_message, detected_at)
  └──────┬───────┘
         │
         ▼
  ┌──────────────────────┐
  │ Preserve last known  │   If entity exists in SQLite from
  │ good state in SQLite │   a previous successful parse, keep it.
  └──────┬───────────────┘   If new file, skip entirely.
         │
         ▼
  ┌──────────────────────┐
  │ Surface in UI        │   Red banner: "N files failed validation"
  │ (corruption alert)   │   Click to see details + file paths
  └──────┬───────────────┘
         │
         ▼
  User manually fixes the YAML file
  OR confirms to ignore via UI
         │
         ▼
  ┌──────────────────────┐
  │ Mark resolved in     │   Set corrupt_files.resolved = true
  │ corrupt_files table  │
  └──────────────────────┘
```

---

## 4. API Design

### 4.1 REST API

All API routes live under `/api/`. Request and response bodies are JSON. The API is consumed by the React UI and by agents that don't support MCP.

#### Tasks

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|-------------|----------|
| `GET` | `/api/tasks` | List tasks | Query: `?phase=coding&priority=P1&story_id=STORY-7&blocked=false` | `{ tasks: Task[] }` |
| `POST` | `/api/tasks` | Create task | `{ title, description, priority?, blockers?, assigned_agents?, story_id?, parent_task? }` | `{ task: Task }` |
| `GET` | `/api/tasks/:id` | Get task | — | `{ task: Task, activity: ActivityEntry[] }` |
| `PATCH` | `/api/tasks/:id` | Update task | Partial `Task` fields | `{ task: Task }` |
| `DELETE` | `/api/tasks/:id` | Delete task | — | `{ success: true }` |
| `POST` | `/api/tasks/:id/blockers` | Add blocker | `{ blocker_id: "TASK-40" }` | `{ task: Task }` |
| `DELETE` | `/api/tasks/:id/blockers` | Remove blocker | `{ blocker_id: "TASK-40" }` | `{ task: Task }` |
| `POST` | `/api/tasks/:id/artifacts` | Report artifact | `{ name, phase, path, mime_type? }` | `{ artifact: TaskArtifact }` |
| `GET` | `/api/tasks/:id/activity` | Get activity | Query: `?limit=50&offset=0` | `{ entries: ActivityEntry[] }` |
| `POST` | `/api/tasks/:id/activity` | Log activity | `{ type, message, metadata? }` | `{ entry: ActivityEntry }` |
| `POST` | `/api/tasks/:id/phase` | Signal phase complete | `{ end_token, status?, context? }` | `{ task: Task }` |
| `GET` | `/api/tasks/:id/phase` | Get phase context | — | `{ context: PhaseContext }` |

**PhaseContext** returned by `GET /api/tasks/:id/phase`:

```typescript
interface PhaseContext {
  task: Task;
  phase: Phase;
  design_document?: string;       // Markdown content if past design
  review_comments?: string;       // If looping back from code review
  test_failures?: string;         // If looping back from testing
  human_comments?: string;        // If looping back from manual testing
  previous_artifacts: TaskArtifact[];
}
```

#### Stories

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|-------------|----------|
| `GET` | `/api/stories` | List stories | Query: `?status=in_progress` | `{ stories: StoryWithStatus[] }` |
| `POST` | `/api/stories` | Create story | `{ title, description }` | `{ story: Story }` |
| `GET` | `/api/stories/:id` | Get story | — | `{ story: Story, tasks: Task[] }` |
| `PATCH` | `/api/stories/:id` | Update story | Partial `Story` fields | `{ story: Story }` |
| `POST` | `/api/stories/:id/tasks` | Add task to story | `{ task_id }` | `{ story: Story }` |
| `DELETE` | `/api/stories/:id/tasks` | Remove task from story | `{ task_id }` | `{ story: Story }` |

#### Ports, Worktrees, Agents, Config

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/ports` | List all port allocations |
| `POST` | `/api/ports` | Allocate ports for a task |
| `DELETE` | `/api/ports/:task_id` | Release ports |
| `GET` | `/api/worktrees` | List active worktrees |
| `POST` | `/api/worktrees` | Create worktree for task/agent |
| `DELETE` | `/api/worktrees/:id` | Delete worktree |
| `GET` | `/api/agents` | List agent definitions |
| `PUT` | `/api/agents` | Update agent definitions (full replace) |
| `GET` | `/api/config` | Get project config |
| `PUT` | `/api/config` | Update project config |

#### Auth / Scoping

For V1, the server runs locally. Agent scoping is enforced via a simple mechanism:

- Each agent invocation receives an **agent token** as an environment variable: `MARK2_AGENT_TOKEN=<task_id>:<agent_name>:<phase>`
- API routes that agents call require this token in the `X-Mark2-Agent` header
- The service layer validates that the agent can only modify its own task (the `task_id` in the token must match the route parameter)
- UI requests are not scoped (they can modify any task)

### 4.2 MCP Server

The MCP server is embedded in the Next.js process and exposes Mark2 operations as MCP tools. It delegates to the same service layer as the REST API.

```typescript
// MCP tool definitions

const tools = [
  // ── Task operations ──
  {
    name: "mark2_create_task",
    description: "Create a new task in the Mark2 task board",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short task title" },
        description: { type: "string", description: "Full task description" },
        priority: { type: "string", enum: ["P0", "P1", "P2", "P3"], default: "P2" },
        blockers: { type: "array", items: { type: "string" }, description: "Task IDs this is blocked by" },
        story_id: { type: "string", description: "Parent story ID" },
        parent_task: { type: "string", description: "Parent task ID (for subtasks)" },
      },
      required: ["title", "description"],
    },
  },
  {
    name: "mark2_update_task",
    description: "Update properties of an existing task",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
      },
      required: ["task_id"],
    },
  },
  {
    name: "mark2_get_task",
    description: "Get full details of a task including artifacts and activity",
    inputSchema: {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
    },
  },
  {
    name: "mark2_list_tasks",
    description: "List tasks, optionally filtered by phase, priority, or story",
    inputSchema: {
      type: "object",
      properties: {
        phase: { type: "string" },
        priority: { type: "string" },
        story_id: { type: "string" },
      },
    },
  },
  {
    name: "mark2_add_blocker",
    description: "Add a blocking dependency between tasks",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "Task to add blocker to" },
        blocker_id: { type: "string", description: "Task that blocks it" },
      },
      required: ["task_id", "blocker_id"],
    },
  },

  // ── Story operations ──
  {
    name: "mark2_create_story",
    description: "Create a new story to group related tasks",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
      },
      required: ["title", "description"],
    },
  },
  {
    name: "mark2_add_task_to_story",
    description: "Associate a task with a story",
    inputSchema: {
      type: "object",
      properties: {
        story_id: { type: "string" },
        task_id: { type: "string" },
      },
      required: ["story_id", "task_id"],
    },
  },

  // ── Phase operations ──
  {
    name: "mark2_report_artifact",
    description: "Attach an output artifact to the current task/phase",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        name: { type: "string", description: "Artifact filename" },
        phase: { type: "string" },
        path: { type: "string", description: "Relative path to artifact file" },
        mime_type: { type: "string" },
      },
      required: ["task_id", "name", "phase", "path"],
    },
  },
  {
    name: "mark2_signal_phase_complete",
    description: "Signal that the current phase is done",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        end_token: { type: "string", description: "Phase end token (e.g., DESIGN_COMPLETED)" },
        status: { type: "string", enum: ["success", "failed"], default: "success" },
        context: { type: "string", description: "Additional context (failure details, etc.)" },
      },
      required: ["task_id", "end_token"],
    },
  },
  {
    name: "mark2_get_phase_context",
    description: "Get all inputs needed for the current phase",
    inputSchema: {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
    },
  },

  // ── Activity operations ──
  {
    name: "mark2_log_activity",
    description: "Post a note to the task's activity feed",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        type: { type: "string", enum: ["note", "error", "comment"] },
        message: { type: "string" },
      },
      required: ["task_id", "message"],
    },
  },

  // ── Port operations ──
  {
    name: "mark2_allocate_ports",
    description: "Reserve a port range for a task's services",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        services: {
          type: "object",
          description: "Map of service names to descriptions",
          additionalProperties: { type: "string" },
        },
      },
      required: ["task_id"],
    },
  },
];
```

### 4.3 WebSocket Events

The WebSocket server runs on the same port as the Next.js server, upgraded from `/api/ws`.

**Server → Client events:**

| Event | Payload | Trigger |
|-------|---------|---------|
| `task:updated` | `{ task: Task }` | Any task mutation (phase change, field update) |
| `task:created` | `{ task: Task }` | New task created |
| `task:deleted` | `{ taskId: string }` | Task deleted |
| `activity:new` | `{ taskId: string, entry: ActivityEntry }` | New activity log entry |
| `agent:started` | `{ taskId, agentName, phase, tmuxSession }` | Agent spawned |
| `agent:ended` | `{ taskId, agentName, phase, exitCode, endToken? }` | Agent completed/failed |
| `terminal:output` | `{ sessionId: string, data: string }` | TMUX output chunk (for xterm.js) |
| `corruption:detected` | `{ filePath, error }` | YAML parse failure |

**Client → Server events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `terminal:subscribe` | `{ sessionId: string }` | Start receiving terminal output for a TMUX session |
| `terminal:unsubscribe` | `{ sessionId: string }` | Stop receiving terminal output |
| `terminal:input` | `{ sessionId: string, data: string }` | Send keyboard input to TMUX session |

**Protocol:**

```typescript
// Message envelope
interface WSMessage {
  event: string;
  payload: Record<string, unknown>;
  timestamp: string;
}
```

---

## 5. Pipeline Engine

### 5.1 Phase State Machine

```typescript
// src/lib/orchestration/pipeline.ts

interface PhaseTransition {
  from: Phase;
  to: Phase;
  guard?: (task: Task) => boolean;    // Must return true to allow transition
  trigger: "manual" | "automatic" | "end_token";
  action: (task: Task) => Promise<void>;
}

const TRANSITIONS: PhaseTransition[] = [
  // ── Forward transitions ──
  {
    from: "pending",
    to: "design",
    trigger: "manual",                         // Human drags card or clicks "Start Design"
    guard: (task) => allBlockersResolved(task),
    action: async (task) => {
      await createWorktree(task);
      await spawnAgent(task, "design");
    },
  },
  {
    from: "design",
    to: "coding",
    trigger: "manual",                         // Human approves design
    action: async (task) => {
      await spawnAgent(task, "coding");
    },
  },
  {
    from: "coding",
    to: "testing",
    trigger: "end_token",                      // Agent emits [CODING_COMPLETED]
    action: async (task) => {
      await spawnAgent(task, "testing");
    },
  },
  {
    from: "testing",
    to: "code_review",
    trigger: "end_token",                      // Agent emits [TESTING_PASSED]
    action: async (task) => {
      await spawnAgent(task, "code_review");
    },
  },
  {
    from: "code_review",
    to: "manual_testing",
    trigger: "end_token",                      // Agent emits [REVIEW_COMPLETED] with no actionable findings
    guard: (task) => reviewPassedCleanly(task),
    action: async (task) => {
      await spawnAgent(task, "manual_testing"); // Generates test plan, spins up services
      await allocatePorts(task);
      await startServices(task);
    },
  },
  {
    from: "manual_testing",
    to: "done",
    trigger: "manual",                         // Human approves
    action: async (task) => {
      await mergeToMain(task);
      await cleanupWorktree(task);
      await releasePorts(task);
      await unblockDependentTasks(task);
    },
  },

  // ── Loop-back transitions ──
  {
    from: "testing",
    to: "coding",
    trigger: "end_token",                      // Agent emits [TESTING_FAILED]
    action: async (task) => {
      await incrementLoopCount(task);
      await spawnAgent(task, "coding", { context: "test_failures" });
    },
  },
  {
    from: "code_review",
    to: "coding",
    trigger: "end_token",                      // Agent emits [REVIEW_COMPLETED] with P0s (or configured P1/P2s)
    guard: (task) => reviewRequiresFixes(task),
    action: async (task) => {
      await incrementLoopCount(task);
      await spawnAgent(task, "coding", { context: "review_comments" });
    },
  },
  {
    from: "manual_testing",
    to: "coding",
    trigger: "manual",                         // Human leaves revision comments
    action: async (task) => {
      await incrementLoopCount(task);
      await stopServices(task);
      await spawnAgent(task, "coding", { context: "human_comments" });
    },
  },
];
```

### 5.2 End Token Detection

The orchestration engine detects phase completion by monitoring TMUX session output.

```typescript
// src/lib/orchestration/end-token-watcher.ts

const END_TOKENS: Record<Phase, string[]> = {
  pending: [],
  design: ["[DESIGN_COMPLETED]"],
  coding: ["[CODING_COMPLETED]"],
  testing: ["[TESTING_PASSED]", "[TESTING_FAILED]"],
  code_review: ["[REVIEW_COMPLETED]"],
  manual_testing: ["[MANUAL_TESTING_READY]"],
  done: ["[TASK_COMPLETED]"],
};

class EndTokenWatcher {
  private pollIntervalMs = 2000;     // Check every 2 seconds
  private watchers: Map<string, NodeJS.Timer> = new Map();

  /** Start watching a TMUX session for end tokens. */
  watch(sessionName: string, phase: Phase, onToken: (token: string) => void): void {
    const tokens = END_TOKENS[phase];
    if (tokens.length === 0) return;

    const interval = setInterval(async () => {
      const output = await captureRecentOutput(sessionName, 50); // Last 50 lines
      for (const token of tokens) {
        if (output.includes(token)) {
          clearInterval(interval);
          this.watchers.delete(sessionName);
          onToken(token);
          return;
        }
      }
      // Also check if process has exited (TMUX session died)
      const alive = await isSessionAlive(sessionName);
      if (!alive) {
        clearInterval(interval);
        this.watchers.delete(sessionName);
        onToken("__SESSION_DIED__");
      }
    }, this.pollIntervalMs);

    this.watchers.set(sessionName, interval);
  }

  stopAll(): void {
    for (const interval of this.watchers.values()) {
      clearInterval(interval);
    }
    this.watchers.clear();
  }
}

async function captureRecentOutput(sessionName: string, lines: number): Promise<string> {
  // tmux capture-pane -t {session} -p -S -{lines}
  const { stdout } = await exec(`tmux capture-pane -t ${sessionName} -p -S -${lines}`);
  return stdout;
}

async function isSessionAlive(sessionName: string): Promise<boolean> {
  try {
    await exec(`tmux has-session -t ${sessionName}`);
    return true;
  } catch {
    return false;
  }
}
```

### 5.3 Loop-Back Logic

Each loop-back carries context from the failing phase to the coding agent:

| Loop-back | Context passed to coding agent |
|-----------|-------------------------------|
| Testing → Coding | Test failure output: stack traces, assertion errors, failed test names. Appended to the task prompt as a `## Test Failures` section. |
| Code Review → Coding | Review report markdown with P0/P1/P2 findings, file/line references, and suggested fixes. Appended as `## Code Review Findings`. |
| Manual Testing → Coding | Human comments from the UI. Appended as `## Revision Comments`. |

**Max loop count:** Configured in `config.yaml` (default: 5). After exceeding the max, the task is flagged as `stuck` in the activity log and the human is notified. The task remains in its current phase until manually resolved.

### 5.4 Phase Transition Handler

What happens at each transition:

| Transition | Actions |
|------------|---------|
| Pending → Design | 1. Validate all blockers resolved. 2. Create worktree from latest `main`. 3. Assemble prompt (4 layers). 4. Spawn agent in TMUX. 5. Start end-token watcher. |
| Design → Coding | 1. (Worktree already exists.) 2. Assemble prompt with design doc. 3. Spawn coding agent in TMUX. 4. Start end-token watcher. |
| Coding → Testing | 1. (Same worktree.) 2. Assemble prompt with task + design context. 3. Spawn testing agent. 4. Start watcher for `TESTING_PASSED` / `TESTING_FAILED`. |
| Testing → Code Review | 1. Assemble prompt with diff against main. 2. Spawn review agent (ideally different model). 3. Start watcher for `REVIEW_COMPLETED`. |
| Code Review → Manual Testing | 1. Generate test plan via agent. 2. Allocate ports (deterministic formula). 3. Start services in worktree on allocated ports. 4. Emit `task:updated` WebSocket event. |
| Manual Testing → Done | 1. Rebase worktree branch onto latest main. 2. Resolve conflicts via LLM agent. 3. Squash merge (or preserve-commits merge). 4. Delete worktree + branch. 5. Release ports. 6. Unblock dependent tasks. 7. Emit `task:updated`. |
| Testing → Coding (loop) | 1. Capture test failure output. 2. Increment `loop_count`. 3. Assemble prompt with failure context. 4. Spawn coding agent. |
| Code Review → Coding (loop) | 1. Capture review report. 2. Determine which findings to fix (P0 always, P1/P2 per config). 3. Increment `loop_count`. 4. Assemble prompt with review comments. 5. Spawn coding agent. |
| Manual Testing → Coding (loop) | 1. Capture human comments from UI. 2. Stop running services. 3. Increment `loop_count`. 4. Assemble prompt with human feedback. 5. Spawn coding agent. |

---

## 6. Agent Orchestration

### 6.1 CLI Tool Adapter Interface

```typescript
// src/lib/adapters/types.ts

interface CLIAdapter {
  /** Unique identifier for this CLI tool */
  readonly toolId: "claude-code" | "codex-cli" | "gemini-cli" | "opencode";

  /** Build the full shell command to invoke the agent.
   *  The command will be executed inside a TMUX session. */
  buildCommand(params: AgentInvocationParams): string;

  /** Return environment variables to set for the process */
  getEnvironment(params: AgentInvocationParams): Record<string, string>;

  /** Whether this tool supports MCP (if so, the MCP server URL is passed) */
  readonly supportsMCP: boolean;

  /** Whether this tool supports session/agent naming */
  readonly supportsNaming: boolean;
}

interface AgentInvocationParams {
  prompt: string;                    // Fully assembled 4-layer prompt
  workingDirectory: string;          // Worktree path
  agentName: string;                 // e.g. "claude-python-pro"
  model: string;                     // e.g. "claude-sonnet-4-20250514"
  taskId: string;
  phase: Phase;
  mcpServerUrl?: string;             // If tool supports MCP
  apiBaseUrl: string;                // REST API base URL for fallback
  agentToken: string;                // Scoped auth token
  timeoutMinutes: number;
}
```

### 6.2 Adapter Implementations

```typescript
// src/lib/adapters/claude-code.ts

class ClaudeCodeAdapter implements CLIAdapter {
  readonly toolId = "claude-code";
  readonly supportsMCP = true;
  readonly supportsNaming = true;

  buildCommand(params: AgentInvocationParams): string {
    const parts = [
      "claude",
      "--dangerously-skip-permissions",
      `--model ${params.model}`,
      "--print",                     // Non-interactive: print output and exit
    ];
    if (params.mcpServerUrl) {
      parts.push(`--mcp-config ${params.workingDirectory}/.mark2/mcp-config.json`);
    }
    // Prompt is passed via stdin or --prompt flag
    parts.push(`--prompt "${escapeShell(params.prompt)}"`);
    return parts.join(" ");
  }

  getEnvironment(params: AgentInvocationParams): Record<string, string> {
    return {
      MARK2_AGENT_TOKEN: `${params.taskId}:${params.agentName}:${params.phase}`,
      MARK2_API_URL: params.apiBaseUrl,
      MARK2_TASK_ID: params.taskId,
    };
  }
}

// src/lib/adapters/codex-cli.ts

class CodexCLIAdapter implements CLIAdapter {
  readonly toolId = "codex-cli";
  readonly supportsMCP = false;
  readonly supportsNaming = false;

  buildCommand(params: AgentInvocationParams): string {
    return [
      "codex",
      "--full-auto",
      `--model ${params.model}`,
      `"${escapeShell(params.prompt)}"`,
    ].join(" ");
  }

  getEnvironment(params: AgentInvocationParams): Record<string, string> {
    return {
      MARK2_AGENT_TOKEN: `${params.taskId}:${params.agentName}:${params.phase}`,
      MARK2_API_URL: params.apiBaseUrl,
      MARK2_TASK_ID: params.taskId,
    };
  }
}

// src/lib/adapters/gemini-cli.ts

class GeminiCLIAdapter implements CLIAdapter {
  readonly toolId = "gemini-cli";
  readonly supportsMCP = false;
  readonly supportsNaming = false;

  buildCommand(params: AgentInvocationParams): string {
    return [
      "gemini",
      `--model ${params.model}`,
      `"${escapeShell(params.prompt)}"`,
    ].join(" ");
  }

  getEnvironment(params: AgentInvocationParams): Record<string, string> {
    return {
      MARK2_AGENT_TOKEN: `${params.taskId}:${params.agentName}:${params.phase}`,
      MARK2_API_URL: params.apiBaseUrl,
      MARK2_TASK_ID: params.taskId,
    };
  }
}
```

### 6.3 Process Lifecycle

```
Spawn Agent
    │
    ▼
┌───────────────────────────────┐
│ 1. Resolve agent definition   │  Look up agent in agents.yaml
│    from agents.yaml           │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ 2. Assemble 4-layer prompt    │  System + Orchestration + Role + Task
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ 3. Get CLI adapter            │  Based on agent.cli_tool
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ 4. Build command + env vars   │  adapter.buildCommand() + getEnvironment()
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ 5. Create TMUX session        │  tmux new-session -d -s {name} -c {worktree}
│    Name: mark2_{taskId}_{agent}_{phase}
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ 6. Send command to session    │  tmux send-keys -t {name} '{command}' Enter
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ 7. Record in agent_sessions   │  Insert row with status="running"
│    table                      │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ 8. Start EndTokenWatcher      │  Poll TMUX output every 2s
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ 9. Emit agent:started via WS  │  Notify UI
└───────────────────────────────┘
                │
        ┌───────┴──────────┐
        │                  │
   End token           Session dies
   detected            (crash/timeout)
        │                  │
        ▼                  ▼
  Handle transition    Mark as failed,
  (see §5.4)           notify UI
```

### 6.4 Prompt Assembly

The `PromptAssembler` constructs the full prompt from four layers:

```typescript
// src/lib/orchestration/prompt-assembler.ts

class PromptAssembler {
  async assemble(task: Task, agent: AgentDefinition, phase: Phase): Promise<string> {
    const layers = [
      await this.getSystemPrompt(task),
      await this.getOrchestrationPrompt(task, phase),
      this.getRolePrompt(agent),
      await this.getTaskPrompt(task, phase),
    ];
    return layers.join("\n\n---\n\n");
  }

  /** Layer 1: Organization-level system prompt */
  private async getSystemPrompt(task: Task): Promise<string> {
    // Read from .mark2/context.json or a user-supplied system prompt file
    const context = await readContextJson();
    return context.system_prompt || "";
  }

  /** Layer 2: Mark2 orchestration instructions */
  private async getOrchestrationPrompt(task: Task, phase: Phase): Promise<string> {
    return `
# Mark2 Orchestration Context

You are operating within the Mark2 agentic orchestration system.
You are working on task ${task.id}: "${task.title}"
Current phase: ${phase}

## Available Tools

You have access to the Mark2 API for managing tasks and reporting progress.

### Via MCP (preferred if your tool supports it)
The following MCP tools are available:
- mark2_create_task: Create subtasks if you discover additional work
- mark2_report_artifact: Report output artifacts (documents, test results)
- mark2_signal_phase_complete: Signal when you're done with this phase
- mark2_log_activity: Post notes to the task's activity feed
- mark2_get_task: Get details of any task
- mark2_list_tasks: List tasks in the system
- mark2_add_blocker: Add blocking dependencies

### Via REST API (fallback)
Base URL: ${process.env.MARK2_API_URL || "http://localhost:3100/api"}
Include header: X-Mark2-Agent: ${process.env.MARK2_AGENT_TOKEN}

## Phase Instructions: ${phase.toUpperCase()}

${this.getPhaseInstructions(phase)}

## CRITICAL RULES
1. You MUST emit the end token when your work is complete: ${END_TOKENS[phase].join(" or ")}
2. Log notable observations to the activity feed
3. Report all output artifacts via mark2_report_artifact
4. Create subtasks for any discovered work that is out of scope
5. All work must happen within your worktree directory
    `.trim();
  }

  private getPhaseInstructions(phase: Phase): string {
    const instructions: Record<Phase, string> = {
      pending: "",
      design: `
Produce a plan document (markdown) covering:
- Summary of approach
- Files to create or modify
- Key architectural decisions
- Edge cases and risks
- Dependencies on other tasks

Save the plan as {task_id}_design.md in the artifacts directory.
Report it via mark2_report_artifact.

When complete, emit: [DESIGN_COMPLETED]`,

      coding: `
Implement the feature as defined by the approved design document.
- Read the design document first
- Implement in the isolated worktree
- Commit your changes with clear commit messages
- Create subtasks for any discovered additional work

When complete, emit: [CODING_COMPLETED]`,

      testing: `
Write and run automated tests for the implementation:
- Unit tests for new/modified code
- Integration tests for end-to-end verification
- Use Playwright for UI tests if applicable

If ALL tests pass, emit: [TESTING_PASSED]
If ANY tests fail, emit: [TESTING_FAILED]
Include failure details (stack traces, test names) in your output before the end token.`,

      code_review: `
Review all code changes (diff against main branch).
Categorize findings by severity:
- P0 (Critical): Security vulnerabilities, data loss, correctness bugs
- P1 (Major): Performance issues, poor error handling, missing edge cases
- P2 (Minor): Style issues, naming, minor refactors

Produce a review report in markdown with file/line references.
Report it via mark2_report_artifact.

When complete, emit: [REVIEW_COMPLETED]`,

      manual_testing: `
Generate a manual test plan with:
- Prerequisites / setup steps
- Test scenarios with expected outcomes
- Edge cases to verify
- Links to running services

Save as {task_id}_test_plan.md and report via mark2_report_artifact.

When complete, emit: [MANUAL_TESTING_READY]`,

      done: `
Merge the worktree branch into main:
1. Rebase onto latest main
2. Resolve any conflicts
3. Squash merge with descriptive commit message
4. Clean up worktree and branch

When complete, emit: [TASK_COMPLETED]`,
    };
    return instructions[phase];
  }

  /** Layer 3: Agent role/personality prompt */
  private getRolePrompt(agent: AgentDefinition): string {
    return `# Your Role\n\n${agent.role_prompt}`;
  }

  /** Layer 4: Task-specific context */
  private async getTaskPrompt(task: Task, phase: Phase): Promise<string> {
    let prompt = `# Task: ${task.id}\n\n## Title\n${task.title}\n\n## Description\n${task.description}`;

    // Attach design document if past design phase
    if (phase !== "pending" && phase !== "design") {
      const designDoc = await this.getArtifactContent(task, "design");
      if (designDoc) {
        prompt += `\n\n## Approved Design\n${designDoc}`;
      }
    }

    // Attach loop-back context if present
    const loopContext = await this.getLoopBackContext(task, phase);
    if (loopContext) {
      prompt += `\n\n${loopContext}`;
    }

    return prompt;
  }
}
```

### 6.5 Bake-off Execution

When multiple agents are assigned to a task:

1. **Parallel spawning:** Each agent gets its own worktree and TMUX session. All are spawned concurrently.
2. **Independent execution:** Each agent runs independently through the current phase. End tokens are tracked per-agent.
3. **Completion:** When all agents complete the phase, the UI shows a comparison view. The human picks a winner.
4. **Winner promotion:** The losing worktrees are deleted. The winning worktree continues to the next phase.

```typescript
async function spawnBakeoff(task: Task, phase: Phase): Promise<void> {
  const agents = task.assigned_agents;

  // Create separate worktrees for each agent
  await Promise.all(agents.map(agentName =>
    worktreeService.create(task.id, agentName, /* isBakeoff */ true)
  ));

  // Spawn all agents concurrently
  await Promise.all(agents.map(agentName =>
    spawnAgent(task, phase, agentName)
  ));

  // Each agent gets its own EndTokenWatcher
  // When ALL complete, emit bakeoff:complete event to UI
}
```

### 6.6 TMUX Session Management

```typescript
// src/lib/utils/tmux.ts

/** Session naming convention: mark2_{taskId}_{agentName}_{phase} */
function sessionName(taskId: string, agentName: string, phase: Phase): string {
  return `mark2_${taskId}_${agentName}_${phase}`;
}

/** Create a new TMUX session */
async function createSession(name: string, workingDir: string): Promise<void> {
  await exec(`tmux new-session -d -s "${name}" -c "${workingDir}"`);
}

/** Send a command to a TMUX session */
async function sendCommand(name: string, command: string): Promise<void> {
  await exec(`tmux send-keys -t "${name}" '${command}' Enter`);
}

/** Capture recent output from a session */
async function capturePane(name: string, lines: number): Promise<string> {
  const { stdout } = await exec(`tmux capture-pane -t "${name}" -p -S -${lines}`);
  return stdout;
}

/** Kill a TMUX session */
async function killSession(name: string): Promise<void> {
  try {
    await exec(`tmux kill-session -t "${name}"`);
  } catch {
    // Session may already be dead — that's fine
  }
}

/** List all Mark2 TMUX sessions */
async function listSessions(): Promise<string[]> {
  try {
    const { stdout } = await exec(`tmux list-sessions -F "#{session_name}" | grep "^mark2_"`);
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/** Check if session exists and has a running process */
async function isSessionAlive(name: string): Promise<boolean> {
  try {
    await exec(`tmux has-session -t "${name}"`);
    return true;
  } catch {
    return false;
  }
}
```

---

## 7. Git Worktree Management

### 7.1 Worktree Lifecycle

```
Task enters Design phase
        │
        ▼
┌───────────────────────────────┐
│ 1. Fetch latest main          │  git fetch origin main
│ 2. Create branch              │  git branch mark2/{taskId} origin/main
│ 3. Create worktree            │  git worktree add ../{project}_{taskId} mark2/{taskId}
│ 4. Record in worktree_records │
└───────────────┬───────────────┘
                │
                ▼
     Agent works in worktree
     (design → coding → testing → review)
                │
                ▼
  Task reaches Done phase
                │
                ▼
┌───────────────────────────────┐
│ 1. Rebase onto main           │  git rebase origin/main (in worktree)
│ 2. Resolve conflicts (LLM)    │  If needed
│ 3. Squash merge to main       │  git checkout main && git merge --squash mark2/{taskId}
│ 4. Commit with message        │  git commit (LLM-generated message)
│ 5. Remove worktree            │  git worktree remove ../{project}_{taskId}
│ 6. Delete branch              │  git branch -D mark2/{taskId}
│ 7. Update worktree_records    │  status = "merged"
└───────────────────────────────┘
```

### 7.2 Branch Naming

| Scenario | Branch Name | Worktree Directory |
|----------|-------------|-------------------|
| Single agent | `mark2/TASK-42` | `../{project}_TASK-42` |
| Bake-off agent A | `mark2/TASK-42/claude-python-pro` | `../{project}_TASK-42_claude-python-pro` |
| Bake-off agent B | `mark2/TASK-42/gemini-fullstack` | `../{project}_TASK-42_gemini-fullstack` |

Worktree directories are created adjacent to the main repo checkout (parent directory of the project root), following standard git worktree conventions.

### 7.3 Implementation

```typescript
// src/lib/services/worktree-service.ts

class WorktreeService {
  constructor(
    private projectRoot: string,
    private projectName: string,
    private db: DrizzleDB,
  ) {}

  async create(taskId: string, agentName: string, isBakeoff: boolean): Promise<string> {
    const branchName = isBakeoff
      ? `mark2/${taskId}/${agentName}`
      : `mark2/${taskId}`;

    const dirName = isBakeoff
      ? `${this.projectName}_${taskId}_${agentName}`
      : `${this.projectName}_${taskId}`;

    const worktreePath = path.resolve(this.projectRoot, "..", dirName);

    // Ensure we're branching from latest main
    await exec(`git -C "${this.projectRoot}" fetch origin main`);
    await exec(`git -C "${this.projectRoot}" branch "${branchName}" origin/main`);
    await exec(`git -C "${this.projectRoot}" worktree add "${worktreePath}" "${branchName}"`);

    // Record in database
    await this.db.insert(worktree_records).values({
      task_id: taskId,
      agent_name: agentName,
      worktree_path: worktreePath,
      branch_name: branchName,
      created_at: new Date().toISOString(),
      status: "active",
    });

    return worktreePath;
  }

  async merge(taskId: string, agentName: string, strategy: MergeStrategy): Promise<MergeResult> {
    const record = await this.getRecord(taskId, agentName);
    const { worktree_path, branch_name } = record;

    // Step 1: Rebase onto latest main
    await exec(`git -C "${this.projectRoot}" fetch origin main`);
    try {
      await exec(`git -C "${worktree_path}" rebase origin/main`);
    } catch (e) {
      // Conflict during rebase — attempt LLM resolution
      const resolved = await this.resolveConflictsWithLLM(worktree_path, taskId);
      if (!resolved) {
        return { success: false, error: "merge_conflict" };
      }
    }

    // Step 2: Merge into main
    if (strategy === "squash") {
      await exec(`git -C "${this.projectRoot}" checkout main`);
      await exec(`git -C "${this.projectRoot}" merge --squash "${branch_name}"`);
      const message = await this.generateCommitMessage(taskId);
      await exec(`git -C "${this.projectRoot}" commit -m "${escapeShell(message)}"`);
    } else {
      // Preserve commits: fast-forward merge after rebase
      await exec(`git -C "${this.projectRoot}" checkout main`);
      await exec(`git -C "${this.projectRoot}" merge --ff-only "${branch_name}"`);
    }

    return { success: true };
  }

  async cleanup(taskId: string, agentName: string): Promise<void> {
    const record = await this.getRecord(taskId, agentName);
    await exec(`git -C "${this.projectRoot}" worktree remove "${record.worktree_path}" --force`);
    await exec(`git -C "${this.projectRoot}" branch -D "${record.branch_name}"`);
    await this.db.update(worktree_records)
      .set({ status: "merged" })
      .where(eq(worktree_records.task_id, taskId));
  }

  private async resolveConflictsWithLLM(worktreePath: string, taskId: string): Promise<boolean> {
    // Spawn an LLM agent specifically for conflict resolution
    // The agent receives:
    //   - The conflict markers
    //   - The task's design document
    //   - Context about what the task implements
    // Returns true if all conflicts resolved, false if needs human intervention
    // ... implementation ...
    return true;
  }

  private async generateCommitMessage(taskId: string): Promise<string> {
    // LLM generates commit message including:
    //   - Task ID and title
    //   - Summary of changes
    //   - List of files modified
    // ... implementation ...
    return `[${taskId}] Implement feature (squash merge)`;
  }
}

interface MergeResult {
  success: boolean;
  error?: "merge_conflict" | "rebase_failed";
}
```

### 7.4 Conflict Escalation Flow

```
Rebase detects conflicts
        │
        ▼
┌───────────────────────────────┐
│ Spawn LLM conflict resolver   │  Agent reads conflict markers + task context
└───────────────┬───────────────┘
                │
        ┌───────┴───────┐
        │               │
   All resolved     Cannot resolve
        │               │
        ▼               ▼
  Continue with    Move task to
  rebase + merge   "merge_conflict"
                   state on board
                        │
                        ▼
                   Human resolves
                   manually in
                   terminal tab
                        │
                        ▼
                   Resume merge
```

---

## 8. UI Components

### 8.1 Component Tree

```
<RootLayout>                        # Dark theme, global styles
  <Board>                           # Main board view (/)
    <StoryFilter />                 # Dropdown: filter by story
    <BoardColumns>
      <Column phase="pending">     # One column per phase
        <Card task={task} />       # Draggable task card
        <Card task={task} />
      </Column>
      <Column phase="design">
        <Card task={task} />
      </Column>
      ...7 columns total
    </BoardColumns>
    <CreateTaskButton />
  </Board>

  <TaskDetail task={task}>          # Slide-over panel (opens on card click)
    <TaskHeader />                  # ID, title, priority, agents
    <PhaseTimeline />               # Visual phase dots/progress
    <ActionBar />                   # Phase-specific action buttons
    <Tabs>
      <ArtifactsTab />              # Markdown, images, files
      <ActivityTab />               # Chronological feed
      <CodeTab />                   # Git diff viewer
      <TerminalTab />               # xterm.js embedded terminal
      <BakeoffTab />                # Side-by-side comparison (conditional)
    </Tabs>
  </TaskDetail>
</RootLayout>
```

### 8.2 Card Component

```typescript
// src/components/board/Card.tsx

interface CardProps {
  task: Task;
  onDragStart: (taskId: string) => void;
  onClick: (taskId: string) => void;
}

// Visual states:
// - "idle"     : default card appearance
// - "running"  : pulsing green border, agent avatar has activity indicator
// - "waiting"  : amber border, human action needed
// - "failed"   : red border, error indicator
// - "looping"  : blue border with loop count badge
// - "blocked"  : dimmed, lock icon, links to blocking tasks

// Card displays:
// ┌──────────────────────────────────┐
// │ P1  TASK-42                      │
// │                                  │
// │ Add user authentication          │
// │                                  │
// │ 🤖 claude-python-pro     ●      │  ← agent + status indicator
// │ ⏱  2h 15m in Coding             │  ← time in phase
// │ 🔒 Blocked by TASK-40           │  ← blocker (if applicable)
// └──────────────────────────────────┘
```

### 8.3 Task Detail Panel

The detail panel is a slide-over that opens from the right side of the board.

**Header section:**
- Task ID + title (editable inline)
- Priority selector (P0–P3 dropdown)
- Assigned agent(s) with avatars
- Story badge (clickable, filters board)
- Phase badge

**Phase timeline:**
- Horizontal dots/steps for each phase
- Completed phases: filled green
- Current phase: filled blue with pulse
- Future phases: outlined gray
- Timestamp for when each phase was entered

**ActionBar** (phase-specific buttons):

| Phase | Actions |
|-------|---------|
| Pending | "Start Design" button (disabled if blocked) |
| Design | "Approve Design" / "Request Changes" / "Open Terminal" |
| Coding | "Open Terminal" (for observation) |
| Testing | (automated — no actions, shows progress) |
| Code Review | "Accept Review" / "Request Fixes" / "Open Terminal" |
| Manual Testing | "Approve & Merge" / "Request Revisions" (with comment box) |
| Done | "View Merge Commit" |

**Tabs:**

| Tab | Content |
|-----|---------|
| Artifacts | List of artifacts grouped by phase. Markdown rendered inline. Images displayed inline. JSON/test results formatted. |
| Activity | Reverse-chronological feed. Each entry shows: timestamp, source (agent/human/system), type icon, message. Human can add comments. |
| Code | Git diff viewer showing all changes in the worktree vs. main. File tree on left, diff on right. Uses a diff rendering library (e.g., `react-diff-viewer`). |
| Terminal | Embedded xterm.js terminal connected to the agent's TMUX session via WebSocket. Shows live output. Supports input for human interaction with agent. |
| Bake-off | (Only shown for multi-agent tasks.) Side-by-side comparison of artifacts, diffs, and test results from each agent. "Select Winner" button for each. |

### 8.4 Terminal Tab (xterm.js)

```typescript
// src/hooks/useTerminal.ts

function useTerminal(tmuxSession: string) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const { sendMessage, subscribe } = useWebSocket();

  useEffect(() => {
    const term = new Terminal({
      theme: { background: "#1a1a2e", foreground: "#e0e0e0" },
      fontFamily: "JetBrains Mono, monospace",
      fontSize: 13,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current!);
    fitAddon.fit();

    // Subscribe to terminal output
    sendMessage({ event: "terminal:subscribe", payload: { sessionId: tmuxSession } });

    const unsub = subscribe("terminal:output", (payload) => {
      if (payload.sessionId === tmuxSession) {
        term.write(payload.data);
      }
    });

    // Send input back to TMUX
    term.onData((data) => {
      sendMessage({ event: "terminal:input", payload: { sessionId: tmuxSession, data } });
    });

    return () => {
      unsub();
      sendMessage({ event: "terminal:unsubscribe", payload: { sessionId: tmuxSession } });
      term.dispose();
    };
  }, [tmuxSession]);

  return terminalRef;
}
```

Additionally, a "Open in Terminal" button that runs:
```bash
tmux attach -t {sessionName}
```
This opens the user's native terminal emulator for full interaction.

### 8.5 Drag-and-Drop Phase Transitions

Using a library like `@dnd-kit/core`:

- Cards are draggable between columns
- Drop targets are the phase columns
- On drop, the system checks if the transition is valid (via the state machine guards)
- Forward skipping (e.g., Pending → Coding) shows a confirmation dialog: "Skip Design phase?"
- Backward drags (e.g., Testing → Coding) show a "Send back with comments?" dialog
- Invalid transitions (e.g., Testing → Done) show an error toast

### 8.6 Story Filtering

- Dropdown at the top of the board: "All Tasks" / story titles
- When a story is selected, only tasks with that `story_id` are shown
- Story selector shows task counts: "Auth System (3/7 done)"
- "Clear filter" button to return to all tasks

---

## 9. Configuration

### 9.1 `.mark2/config.yaml` Schema

```yaml
# .mark2/config.yaml — Full schema with defaults shown

# Project name (used in worktree directory names)
project_name: myproject

# Server configuration
server_port: 3100

# Port allocation
base_port: 3000         # Starting port for task allocation
ports_per_task: 10      # Each task gets this many ports

# Default merge strategy ("squash" or "preserve")
merge_strategy: squash

# Auto-fix configuration for code review findings
auto_fix:
  P0: true              # Always auto-fix critical issues
  P1: false             # Don't auto-fix major issues by default
  P2: false             # Don't auto-fix minor issues by default

# Maximum coding↔testing loop iterations before flagging as stuck
max_loop_count: 5

# Phase-specific defaults
phase_defaults:
  design:
    default_agent: claude-architect
    timeout_minutes: 30
    auto_advance: false     # Require human approval
  coding:
    default_agent: claude-python-pro
    timeout_minutes: 120
    auto_advance: true      # Auto-advance to testing
  testing:
    default_agent: claude-python-pro   # Same agent runs tests
    timeout_minutes: 60
    auto_advance: true      # Auto-advance based on end token
  code_review:
    default_agent: codex-reviewer      # Different model for review
    timeout_minutes: 30
    auto_advance: true
  manual_testing:
    default_agent: claude-architect    # Generates test plan
    timeout_minutes: 15
    auto_advance: false     # Require human approval
  done:
    timeout_minutes: 30     # For merge operation
```

### 9.2 `.mark2/agents.yaml` Schema

```yaml
# .mark2/agents.yaml — Agent definitions

agents:
  - name: claude-architect
    cli_tool: claude-code
    model: claude-opus-4-20250115
    role_prompt: |
      You are a senior system architect with deep expertise in software design.
      You excel at breaking down complex features into well-structured implementation plans.
      You consider edge cases, security implications, and performance impacts.
      You write clear, actionable design documents.
    timeout_minutes: 30

  - name: claude-python-pro
    cli_tool: claude-code
    model: claude-sonnet-4-20250514
    role_prompt: |
      You are a senior Python backend engineer with expertise in FastAPI, SQLAlchemy,
      and modern Python patterns. You write clean, well-tested code with comprehensive
      error handling. You follow PEP 8 and use type hints throughout.
    timeout_minutes: 120

  - name: gemini-fullstack
    cli_tool: gemini-cli
    model: gemini-2.5-pro
    role_prompt: |
      You are a full-stack TypeScript engineer proficient in Next.js, React, and Node.js.
      You build responsive UIs with Tailwind CSS and write type-safe APIs.
    timeout_minutes: 120

  - name: codex-reviewer
    cli_tool: codex-cli
    model: o3
    role_prompt: |
      You are a security-focused code reviewer. You identify vulnerabilities,
      performance issues, and correctness bugs. You categorize findings by severity
      (P0 Critical, P1 Major, P2 Minor) and provide specific fix recommendations
      with file and line references.
    timeout_minutes: 30

  - name: gemini-tester
    cli_tool: gemini-cli
    model: gemini-2.5-pro
    role_prompt: |
      You are a QA engineer specializing in automated testing. You write comprehensive
      unit tests, integration tests, and end-to-end tests. You use Playwright for
      UI testing and appropriate HTTP clients for API testing.
    timeout_minutes: 60
```

### 9.3 `.mark2/context.json` Spec

This is the compact manifest that every agent reads at the start of invocation. It tells agents that they're operating within Mark2 and how to interact with it.

```json
{
  "system": "mark2",
  "version": "1.0.0",
  "description": "You are operating within Mark2, an agentic software development orchestrator.",

  "api": {
    "rest_base_url": "http://localhost:3100/api",
    "auth_header": "X-Mark2-Agent",
    "auth_value_env": "MARK2_AGENT_TOKEN"
  },

  "mcp": {
    "enabled": true,
    "tools_prefix": "mark2_"
  },

  "system_prompt": "Company-specific coding standards and conventions go here. This is provided by the user during mark2 init or edited later in config.",

  "rules": [
    "Always emit the designated end token when your phase work is complete",
    "Log notable observations via mark2_log_activity",
    "Report all output artifacts via mark2_report_artifact",
    "Create subtasks for discovered work via mark2_create_task",
    "Work only within your assigned worktree directory",
    "Do not modify files outside your worktree",
    "Read the design document before starting coding or testing phases"
  ],

  "end_tokens": {
    "design": "[DESIGN_COMPLETED]",
    "coding": "[CODING_COMPLETED]",
    "testing_passed": "[TESTING_PASSED]",
    "testing_failed": "[TESTING_FAILED]",
    "code_review": "[REVIEW_COMPLETED]",
    "manual_testing": "[MANUAL_TESTING_READY]",
    "done": "[TASK_COMPLETED]"
  },

  "artifact_naming": {
    "design": "{task_id}_design.md",
    "ux_mockup": "{task_id}_ux_{n}.png",
    "test_results": "{task_id}_test_results.json",
    "review_report": "{task_id}_review.md",
    "test_plan": "{task_id}_test_plan.md"
  }
}
```

### 9.4 `mark2 init` Behavior

```
mark2 init
    │
    ├── Create .mark2/ directory
    ├── Create .mark2/tasks/
    ├── Create .mark2/stories/
    ├── Create .mark2/artifacts/
    ├── Write .mark2/config.yaml (from template, prompt for project_name)
    ├── Write .mark2/agents.yaml (default agent definitions)
    ├── Write .mark2/context.json (default manifest)
    ├── Initialize SQLite database (.mark2/mark2.db)
    ├── Add .mark2/mark2.db to .gitignore (create or append)
    ├── Optionally install git hooks:
    │   └── .git/hooks/post-merge → mark2 reindex
    └── Print success message with next steps
```

---

## 10. Error Handling & Resilience

### 10.1 Agent Crash Detection

```
EndTokenWatcher detects session died (no end token)
        │
        ▼
┌───────────────────────────────┐
│ 1. Update agent_sessions      │  status = "failed", exit_code from tmux
│    table                      │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ 2. Log to activity feed       │  "Agent {name} crashed in {phase} phase"
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ 3. Capture last 200 lines     │  From TMUX pane (for diagnostics)
│    of agent output            │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ 4. Emit agent:ended event     │  { status: "failed" } → UI shows red state
│    via WebSocket              │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ 5. Task stays in current      │  No automatic retry.
│    phase with "failed" status │  Human can retry via UI button.
└───────────────────────────────┘
```

**Retry from UI:** A "Retry" button on the failed card re-spawns the agent in the same phase with the same context. Optionally, the human can switch agents before retrying.

### 10.2 Server Restart Recovery

On startup, the server:

1. **Full reindex** from YAML files (canonical state recovered)
2. **Scan for orphaned TMUX sessions** (`tmux list-sessions | grep ^mark2_`)
3. For each orphaned session:
   - Check if process is still running
   - If running: re-attach the EndTokenWatcher
   - If dead: mark as failed in `agent_sessions`, log to activity
4. **Scan `worktree_records`** for stale entries:
   - Verify each worktree path still exists on disk
   - Mark missing worktrees as `cleanup_pending`
5. **Scan `port_allocations`** for stale entries:
   - Check if services are actually running on allocated ports
   - Release ports for dead services

### 10.3 YAML Corruption Handling

See §3.5 for the parse failure flow. Additional safeguards:

- **Write-ahead validation:** Before writing a YAML file, the service layer validates the data against the Zod schema. Invalid writes are rejected with a descriptive error.
- **Atomic writes:** YAML files are written to a temp file first, then renamed (atomic on most filesystems). This prevents partial writes from corrupting files.
- **Git safety net:** Since YAML files are committed to git, `git checkout -- .mark2/tasks/TASK-42.yaml` recovers the last committed version of any corrupted file.

### 10.4 Worktree Cleanup on Failure

| Failure scenario | Cleanup action |
|-----------------|----------------|
| Agent crashes during coding | Worktree preserved (contains partial work). Human decides to retry or abandon. |
| Merge conflict unresolvable | Worktree preserved. Task flagged as `merge_conflict`. Human resolves manually. |
| Task deleted | Worktree + branch deleted. Ports released. TMUX session killed. |
| Server crash during merge | On restart, detect incomplete merge via git state. Abort merge, preserve worktree, flag for human. |
| Timeout | Agent TMUX session killed. Worktree preserved. Task flagged as `timeout`. Human decides. |

### 10.5 Timeout Handling

Each phase has a configurable timeout (from `config.yaml` or `agents.yaml`). The orchestration engine sets a timer when spawning an agent:

```typescript
async function spawnWithTimeout(task: Task, phase: Phase, agentName: string): Promise<void> {
  const agent = await getAgentDefinition(agentName);
  const timeoutMs = agent.timeout_minutes * 60 * 1000;

  const timer = setTimeout(async () => {
    await killSession(sessionName(task.id, agentName, phase));
    await updateSessionStatus(task.id, agentName, "timeout");
    await logActivity(task.id, "system", "error",
      `Agent ${agentName} timed out after ${agent.timeout_minutes} minutes in ${phase} phase`);
    emitWebSocketEvent("agent:ended", {
      taskId: task.id, agentName, phase, status: "timeout",
    });
  }, timeoutMs);

  // Clear timer when end token detected
  endTokenWatcher.watch(sessionName(task.id, agentName, phase), phase, (token) => {
    clearTimeout(timer);
    handleEndToken(task, phase, token);
  });
}
```

---

## 11. Build Sequence

### 11.1 Recommended Implementation Order

The system has clear dependency layers. Build from the bottom up:

```
Phase 1: Foundation
├── Data layer (Zod schemas, YAML read/write, SQLite schema, Drizzle setup)
├── CLI scaffolding (mark2 init, mark2 start, mark2 reindex)
└── Service layer (TaskService, StoryService — CRUD against YAML + SQLite)

Phase 2: API + Basic UI
├── REST API routes (tasks, stories, config, agents)
├── Board view (columns, cards — read-only first, then drag-and-drop)
├── Task detail panel (header, artifacts tab, activity tab)
└── Task/story creation dialogs

Phase 3: Orchestration Core
├── TMUX manager (create/kill/capture sessions)
├── CLI adapters (Claude Code first, then Codex, Gemini)
├── Prompt assembler (4-layer architecture)
├── End token watcher
├── Pipeline state machine (phase transitions)
└── Worktree service (create, cleanup)

Phase 4: Pipeline Integration
├── Phase handlers (pending → design → coding → testing → review → manual → done)
├── Loop-back logic (testing failures, review findings, human comments)
├── Orchestration engine (ties everything together)
└── Agent scoping (token-based auth)

Phase 5: Real-time + Terminal
├── WebSocket server
├── Real-time board updates
├── Terminal tab (xterm.js + WebSocket bridge to TMUX)
└── Activity feed live updates

Phase 6: Advanced Features
├── Bake-off execution (parallel agents, comparison UI)
├── Merge with LLM conflict resolution
├── Port registry and service management
├── Code diff tab
├── MCP server (for Claude Code native integration)

Phase 7: Polish
├── Error handling + resilience (crash detection, restart recovery)
├── Corruption alerts UI
├── Settings page (agent editor, phase defaults, auto-fix config)
├── Port dashboard
└── "Open in Terminal" native terminal integration
```

### 11.2 MVP Slice

The minimum path to get one task through the full pipeline:

| Step | What to build | Why |
|------|--------------|-----|
| 1 | Zod schemas + YAML reader/writer | All state is in YAML files |
| 2 | SQLite schema + reindex | Needed for fast queries |
| 3 | `mark2 init` CLI command | Creates `.mark2/` directory structure |
| 4 | TaskService (create, update, get, list) | Core entity management |
| 5 | REST API for tasks | UI and agents need this |
| 6 | Minimal board UI (columns + cards, no drag) | Visual feedback |
| 7 | Task detail panel (basic) | See task state |
| 8 | TMUX manager + Claude Code adapter | Spawn one agent |
| 9 | Prompt assembler (Layer 2 + 4 only) | Enough for agent to know its task |
| 10 | End token watcher | Detect phase completion |
| 11 | Pipeline: pending → design → coding → testing → done | Skip code review + manual testing for MVP |
| 12 | Worktree service (create + cleanup) | Agent isolation |
| 13 | Merge (simple squash, no LLM conflict resolution) | Get code to main |

This MVP lets you: create a task in the UI → start design → approve → agent codes → agent tests → merge to main. All other features (bake-offs, WebSocket, terminal, code review, manual testing, MCP) are layered on afterward.

### 11.3 Key Dependencies

```
Zod Schemas ─────► YAML Reader/Writer ─────► Services ─────► API Routes
                                                │
SQLite Schema ──► Drizzle Setup ──► Reindex ────┘
                                                │
                                    Prompt Assembler ──► Phase Handlers
                                         │                    │
TMUX Utils ──► TMUX Manager ─────────────┘                    │
                   │                                          │
CLI Adapters ──────┘                                          │
                                                              │
End Token Watcher ────────────────────────────────────────────┘
                                                              │
                                                    Orchestration Engine
                                                              │
                                              WebSocket ──► Board UI
                                                              │
                                              xterm.js ──► Terminal Tab
```

---

*This tech spec is derived from the [PRD](./PRD.md). All 16 design decisions from the PRD are reflected in the implementation details above.*
