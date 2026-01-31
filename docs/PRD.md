# Product Requirements Document: Mark2 — Agentic Software Development Orchestrator

## 1. Executive Summary

Mark2 is an agentic orchestration platform that models a software development organization as a system of AI agents. It manages the full lifecycle of software tasks — from design through coding, testing, code review, manual QA, and merge — using configurable AI agents backed by any supported CLI tool (Claude Code, Codex CLI, Gemini CLI, OpenCode, etc.).

The platform provides a visual task board (similar to Linear/JIRA in dark mode), manages git worktrees for full isolation between tasks and agent runs, supports bake-off comparisons between agents, and enforces a structured phase pipeline with concrete outputs at every stage.

Mark2 is **not** an AI coding tool — it is the **orchestration layer** that coordinates AI coding tools to operate like a software engineering organization.

---

## 2. Problem Statement

Modern AI coding assistants (Claude Code, Codex, Gemini CLI, etc.) are powerful but operate in isolation. There is no system that:

- Orchestrates multiple AI agents across a structured software development lifecycle
- Manages task dependencies, blocking relationships, and parallel workstreams
- Provides isolation via git worktrees so multiple agents can work simultaneously without conflicts
- Allows bake-off comparisons between different models/tools on the same task
- Enforces quality gates (design review, code review, testing, manual QA) before code reaches main
- Gives humans visibility and control at every stage via a visual UI
- Remains agnostic to the underlying AI tool — letting teams use whichever CLI tools and models they prefer

Mark2 solves all of these problems.

---

## 3. Target Users

| User Type | Description |
|-----------|-------------|
| **Solo developers** | Individual engineers who want to parallelize their work across multiple AI agents and maintain quality gates |
| **Tech leads / Architects** | People who want to define tasks, review AI-generated designs and code, and approve work through a structured pipeline |
| **Engineering teams** | Teams that want to assign different agents to different types of work (e.g., Gemini for Python, Claude for TypeScript) and run bake-offs |
| **Product managers** | Non-technical stakeholders who want to review designs, screenshots, and manually test features before they ship |

---

## 4. Core Concepts

### 4.1 Tasks

A **task** is the fundamental work unit. Tasks represent features, bugs, refactors, or any discrete unit of work.

**Task properties:**

| Property | Description |
|----------|-------------|
| `id` | Unique identifier (e.g., `TASK-42`) |
| `title` | Short human-readable title |
| `description` | Full description of the work to be done. May include acceptance criteria, context, screenshots, or references |
| `phase` | Current phase in the pipeline (see §5) |
| `assigned_agents` | One or more agent definitions assigned to this task (enables bake-offs) |
| `blockers` | List of task IDs that must be completed before this task can begin |
| `blocked_by` | Inverse of blockers — tasks that are waiting on this one |
| `priority` | Priority level (P0, P1, P2, P3) |
| `artifacts` | Map of phase → output artifacts (plan documents, screenshots, test results, review comments, etc.) |
| `activity_log` | Chronological log of agent notes, status changes, and human comments |
| `ports` | Reserved port range for this task's services during manual testing |
| `worktrees` | Map of agent → git worktree path |
| `created_by` | Human or agent that created this task |
| `story_id` | Optional reference to the parent story this task belongs to |
| `parent_task` | Optional reference to a parent task (for subtasks spawned during design or coding) |

**Task creation:** Tasks can be created by:
- Humans via the UI
- Agents during the design phase (breaking down work into subtasks)
- Agents during the coding phase (discovering additional work needed)
- Agents during code review (creating fix tasks for issues found)

### 4.2 Agents

An **agent** is a named configuration that combines three things:

1. **CLI tool** — The underlying coding assistant (Claude Code, Codex CLI, Gemini CLI, OpenCode, etc.)
2. **Model** — The specific model to use (e.g., `claude-sonnet-4-20250514`, `o3`, `gemini-2.5-pro`)
3. **Role prompt** — A personality/role prompt that shapes the agent's behavior (e.g., "You are a senior Python backend engineer", "You are a security-focused code reviewer", "You are a UX designer")

**Example agent definitions:**

| Agent Name | CLI Tool | Model | Role |
|------------|----------|-------|------|
| `claude-python-pro` | Claude Code | claude-sonnet-4-20250514 | Senior Python backend engineer |
| `gemini-fullstack` | Gemini CLI | gemini-2.5-pro | Full-stack TypeScript engineer |
| `codex-reviewer` | Codex CLI | o3 | Security-focused code reviewer |
| `claude-architect` | Claude Code | claude-opus-4-20250115 | System architect and designer |
| `gemini-tester` | Gemini CLI | gemini-2.5-pro | QA engineer specializing in integration tests |

Agents are defined in a project-level configuration file and can be assigned to any phase or task.

### 4.3 Worktrees

Every active task gets its own **git worktree**, ensuring complete isolation. The naming convention is:

- **Single agent:** `{projectname}_{task_id}` (e.g., `bluebubbles_TASK-42`)
- **Bake-off (multiple agents on same task):** `{projectname}_{task_id}_{agent_name}` (e.g., `bluebubbles_TASK-42_claude-python-pro`, `bluebubbles_TASK-42_gemini-fullstack`)

Worktrees are created automatically when a task enters an active phase and cleaned up after merge to main.

### 4.4 Bake-offs

A **bake-off** is when multiple agents are assigned to the same task. Each agent works independently in its own worktree. The human can then compare outputs (designs, code, test results) side by side and choose which to promote forward.

Bake-offs can happen at any phase:
- **Design bake-off:** Compare architectural approaches from different agents
- **Coding bake-off:** Compare implementations from different agents/models
- **Code review bake-off:** Get review feedback from multiple perspectives

### 4.5 Stories

A **story** is a higher-level grouping of related tasks. Stories represent features, epics, or initiatives that require multiple tasks to complete.

**Story properties:**

| Property | Description |
|----------|-------------|
| `id` | Unique identifier (e.g., `STORY-7`) |
| `title` | Short human-readable title (e.g., "User authentication system") |
| `description` | Full description of the feature or initiative |
| `tasks` | Ordered list of task IDs that belong to this story |
| `status` | Derived from child tasks: `pending` (no tasks started), `in_progress` (any task active), `completed` (all tasks done) |
| `created_by` | Human or agent that created the story |

**Story behavior:**
- Stories can be created by humans in the UI or by agents during the design phase (when breaking down a large feature)
- Tasks within a story can have dependency relationships with each other (blockers)
- The board UI can filter by story, showing only tasks belonging to a selected story
- Stories do not have their own pipeline phase — they are containers, not work units
- A story is complete when all of its child tasks reach Done

### 4.6 Port Registry

A global **port registry** tracks which ports are allocated to which tasks. This prevents conflicts when multiple tasks are running services simultaneously during manual testing.

| Property | Description |
|----------|-------------|
| `task_id` | The task that owns these ports |
| `ports` | List of allocated ports |
| `services` | Map of port → service description (e.g., `3042 → "frontend dev server"`, `8042 → "API server"`) |

Port allocation strategy should use a deterministic formula based on task ID to avoid collisions (e.g., base port = 3000 + (task_number * 10), giving each task a range of 10 ports).

---

## 5. Pipeline Phases

The pipeline is a linear sequence of phases with well-defined entry criteria, agent behavior, outputs, and exit criteria. Some phases loop back to earlier phases on failure.

```
┌──────────┐   ┌────────┐   ┌────────┐   ┌─────────┐   ┌─────────────┐   ┌────────────────┐   ┌──────┐
│ Pending  │──▶│ Design │──▶│ Coding │──▶│ Testing │──▶│ Code Review │──▶│ Manual Testing │──▶│ Done │
└──────────┘   └────────┘   └────────┘   └─────────┘   └─────────────┘   └────────────────┘   └──────┘
                                ▲              │              │                    │
                                │              ▼              │                    │
                                │         (failures)          │                    │
                                │◀─────────────┘              │                    │
                                │◀────────────────────────────┘                    │
                                │         (P0/P1/P2 fixes)                         │
                                │◀─────────────────────────────────────────────────┘
                                          (revision comments)
```

### 5.1 Phase: Pending

**Purpose:** Backlog. Tasks that have not yet been started.

**Entry criteria:** Task has been created (by human or agent).

**Behavior:**
- Tasks sit here until either a human drags them to Design, or the system auto-promotes them when all blockers are resolved (if configured to do so).
- Tasks can include initial screenshots, descriptions, and reference materials.

**Outputs:** None — this is a holding state.

**Exit criteria:** Human approval (drag to Design) or automatic promotion when blockers clear.

**End token:** N/A

### 5.2 Phase: Design

**Purpose:** Produce a plan document and optional UX artifacts for the task.

**Entry criteria:** Task moved to Design (manually or automatically).

**Agent behavior:**
- Read the task description and any provided screenshots/references
- Analyze the existing codebase to understand the current architecture
- Produce a **plan document** (markdown) with:
  - Summary of the approach
  - Files to be created or modified
  - Key architectural decisions
  - Edge cases and risks
  - Dependencies on other tasks (may create new blocker tasks)
- Optionally produce **UX screenshots/mockups** if the task involves UI work
- May **create new tasks** in the system if the work needs to be broken down into subtasks
- Signal completion with the end token `[DESIGN_COMPLETED]`

**Outputs:**
| Artifact | Format | Naming Convention |
|----------|--------|-------------------|
| Plan document | Markdown | `{task_id}_design.md` |
| UX mockups | PNG/SVG | `{task_id}_ux_{n}.png` |
| New subtasks | Created via API | Linked to parent task |

**Exit criteria:** Human reviews the design outputs in the UI. Human can:
1. **Approve** — move to Coding
2. **Comment** — interact with the agent via TMUX to iterate on the design
3. **Reject** — send back with feedback for redesign

**End token:** `[DESIGN_COMPLETED]`

### 5.3 Phase: Coding

**Purpose:** Implement the feature as defined by the design.

**Entry criteria:** Design approved by human. Worktree created.

**Agent behavior:**
- Read the approved plan document
- Read any UX mockups or screenshots
- Implement the feature in the isolated worktree
- Run in **non-interactive mode** with all permissions granted (no confirmation prompts)
- May **create new tasks** if additional work is discovered during implementation
- Log notable observations to the activity feed (e.g., "Found existing tech debt in auth module — created TASK-58 to address")
- Signal completion with the end token `[CODING_COMPLETED]`

**Outputs:**
| Artifact | Format | Description |
|----------|--------|-------------|
| Code changes | Git commits | All changes committed in the worktree |
| New tasks | Created via API | Any discovered work items |
| Activity notes | Via API | Notable observations, decisions, heads-ups |

**Exit criteria:** Agent signals `[CODING_COMPLETED]`. System automatically moves to Testing.

**End token:** `[CODING_COMPLETED]`

### 5.4 Phase: Testing

**Purpose:** Verify the implementation through automated tests.

**Entry criteria:** Coding completed. Same worktree.

**Agent behavior:**
- Write and run **unit tests** for new/modified code
- Write and run **integration tests** that exercise the feature end-to-end
- Use tools like Playwright for UI testing, HTTP clients for API testing
- If all tests pass → signal `[TESTING_PASSED]`
- If tests fail → signal `[TESTING_FAILED]` with failure context

**Outputs:**
| Artifact | Format | Description |
|----------|--------|-------------|
| Test results | JSON/Markdown | Pass/fail summary with details |
| Test code | Git commits | New test files committed to worktree |
| Failure context | Structured data | On failure: stack traces, screenshots, logs |

**Exit criteria:**
- **All tests pass** → move to Code Review
- **Any tests fail** → loop back to Coding with failure context attached. The coding agent receives the test failures and fixes them. This cycle repeats until all tests pass.

**End tokens:** `[TESTING_PASSED]` or `[TESTING_FAILED]`

### 5.5 Phase: Code Review

**Purpose:** Automated code review to catch bugs, security issues, style violations, and architectural problems.

**Entry criteria:** All tests passing.

**Agent behavior:**
- Review all code changes in the worktree (diff against main)
- Categorize findings by severity:
  - **P0 — Critical:** Security vulnerabilities, data loss risks, correctness bugs. **Always auto-fixed.**
  - **P1 — Major:** Performance issues, poor error handling, missing edge cases. **Auto-fix configurable by user.**
  - **P2 — Minor:** Style issues, naming, minor refactors. **Auto-fix configurable by user.**
- The review agent should ideally be a **different model/tool** than the coding agent to provide diverse perspective
- Signal completion with `[REVIEW_COMPLETED]`

**Outputs:**
| Artifact | Format | Description |
|----------|--------|-------------|
| Review report | Markdown | Categorized findings with severity, description, file/line references |
| Fix recommendations | Inline comments | Specific suggested changes |

**Exit criteria:**
- **No findings (or only P2s that user configured to skip)** → move to Manual Testing
- **P0s exist** → always loop back to Coding with review comments. Coding → Testing → Code Review cycle repeats.
- **P1s/P2s exist** → loop back to Coding if user has configured auto-fix for that severity level. Otherwise, user decides in UI.

**End token:** `[REVIEW_COMPLETED]`

### 5.6 Phase: Manual Testing

**Purpose:** Human QA. The user manually tests the feature in a running environment.

**Entry criteria:** Code review passed. Services are automatically spun up.

**System behavior:**
- Spin up the application in the task's worktree on the task's **allocated ports**
- Generate a **test plan** document with step-by-step instructions for the human
- Provide **links to running services** (e.g., `http://localhost:3042` for frontend, `http://localhost:8042` for API)

**Agent behavior (test plan generation):**
- Produce a structured test plan:
  - Prerequisites / setup steps
  - Test scenarios with expected outcomes
  - Edge cases to verify
  - Links to running services

**Outputs:**
| Artifact | Format | Description |
|----------|--------|-------------|
| Test plan | Markdown | Step-by-step manual test instructions |
| Service URLs | Links | Running service endpoints on allocated ports |

**Exit criteria:** Human reviews and either:
1. **Approves** → move to Done
2. **Leaves comments** → loop back to Coding with the human's feedback. Full cycle repeats (Coding → Testing → Code Review → Manual Testing).

**End token:** `[MANUAL_TESTING_READY]`

### 5.7 Phase: Done

**Purpose:** Merge to main and clean up.

**Entry criteria:** Human approved in Manual Testing.

**System behavior:**
- Use an LLM agent to perform the merge to main (handle conflicts, write merge commit message)
- Clean up the git worktree
- Deallocate reserved ports
- Mark task as complete
- Notify any tasks that were blocked by this one (they may now be unblocked)

**Outputs:**
| Artifact | Format | Description |
|----------|--------|-------------|
| Merge commit | Git | Feature merged to main |
| Completion summary | Markdown | Summary of what was built, tests passing, review clean |

**End token:** `[TASK_COMPLETED]`

---

## 6. Agent Prompt Architecture

Every agent invocation is constructed from **four layers** of prompt, concatenated in order:

```
┌──────────────────────────────────────────────┐
│ Layer 1: System Prompt (Organization-level)   │
│ - Company coding standards                    │
│ - Repository conventions                      │
│ - Tech stack documentation                    │
│ - Global rules and constraints                │
├──────────────────────────────────────────────┤
│ Layer 2: Orchestration Prompt (Mark2-level)   │
│ - How to use the Mark2 API/MCP               │
│ - How to create/update tasks                  │
│ - How to log activity notes                   │
│ - Phase-specific instructions and end tokens  │
│ - How to report artifacts                     │
│ - Reminder: "You are operating within Mark2"  │
├──────────────────────────────────────────────┤
│ Layer 3: Role Prompt (Agent-level)            │
│ - Agent personality and expertise             │
│ - e.g., "Senior Python backend engineer"      │
│ - Coding style preferences                    │
│ - Review focus areas                          │
├──────────────────────────────────────────────┤
│ Layer 4: Task Prompt (Task-level)             │
│ - Task description                            │
│ - Design document (if past design phase)      │
│ - Previous phase outputs                      │
│ - Failure context (if looping back)           │
│ - Review comments (if fixing review items)    │
│ - Human feedback (if revising)                │
└──────────────────────────────────────────────┘
```

### 6.1 Orchestration Awareness (Layer 2)

This is the critical layer that prevents agents from "forgetting" they are part of Mark2. It must include:

- A project manifest file (JSON or Markdown) that is read at the start of every agent invocation
- Clear instructions on available API endpoints / MCP tools
- Phase-specific rules (what the agent is expected to do, what end token to emit)
- Reminders to log activity, report artifacts, and create subtasks when needed
- The task's current state and context

This layer is **injected by Mark2** — it is not written by the user. It is auto-generated based on the current phase and task state.

### 6.2 Preventing Context Drift

To ensure agents don't lose awareness of the orchestration layer:

1. **Project init file:** On `mark2 init`, a `.mark2/context.json` file is created in the repo root. This compact file contains everything an agent needs to know about the Mark2 system, its APIs, and its rules. Every agent reads this first.
2. **Phase preamble:** Each phase invocation starts with a structured preamble that states: what phase this is, what the expected output is, what the end token is, and what tools are available.
3. **End tokens are mandatory:** Every phase must terminate with its designated end token. The orchestrator watches for these tokens to trigger phase transitions.

---

## 7. API / MCP Interface

Agents need a way to communicate back to Mark2. This is exposed as **both a REST API and an MCP server**, backed by the same service layer. The REST API serves the web UI and general integrations. The MCP server provides agent-native communication for CLI tools that support MCP (Claude Code, etc.).

The following operations must be available to agents via both interfaces:

### 7.1 Task Operations

| Endpoint | Description |
|----------|-------------|
| `create_task` | Create a new task with title, description, priority, and optional blockers |
| `update_task` | Update task properties (description, priority, etc.) |
| `add_blocker` | Add a blocking dependency between tasks |
| `remove_blocker` | Remove a blocking dependency |
| `get_task` | Retrieve full task details including artifacts and activity log |
| `list_tasks` | List tasks with optional filters (phase, priority, blocked status) |

### 7.2 Story Operations

| Endpoint | Description |
|----------|-------------|
| `create_story` | Create a new story with title and description |
| `update_story` | Update story properties |
| `add_task_to_story` | Associate a task with a story |
| `remove_task_from_story` | Disassociate a task from a story |
| `get_story` | Retrieve story details including all child tasks and their statuses |
| `list_stories` | List stories with optional filters (status) |

### 7.3 Phase Operations

| Endpoint | Description |
|----------|-------------|
| `report_artifact` | Attach an output artifact to the current task/phase (plan doc, test results, etc.) |
| `signal_phase_complete` | Signal that the current phase is done (includes end token and status) |
| `get_phase_context` | Retrieve all inputs for the current phase (design doc, review comments, failure logs, etc.) |

### 7.4 Activity Operations

| Endpoint | Description |
|----------|-------------|
| `log_activity` | Post a note to the task's activity feed (heads-ups, observations, decisions) |
| `get_activity` | Retrieve the activity log for a task |

### 7.5 Port Operations

| Endpoint | Description |
|----------|-------------|
| `allocate_ports` | Reserve a port range for a task |
| `release_ports` | Free ports when a task is done |
| `list_ports` | Show current port allocations |

### 7.6 Worktree Operations

| Endpoint | Description |
|----------|-------------|
| `create_worktree` | Create a git worktree for a task/agent combination |
| `delete_worktree` | Clean up a worktree |
| `list_worktrees` | List active worktrees |

---

## 8. User Interface

### 8.1 Board View (Primary)

The primary UI is a **Kanban-style board** in dark mode, similar to Linear or JIRA.

**Columns** correspond to pipeline phases:
- Pending | Design | Coding | Testing | Code Review | Manual Testing | Done

**Cards** represent tasks and show:
- Task ID and title
- Assigned agent(s) — with distinct visual indicators for bake-offs (e.g., multiple agent avatars)
- Current status indicator (running, waiting for human, failed, looping)
- Priority badge (P0–P3)
- Blocker indicators (visual link to blocking tasks)
- Time in current phase

**Card interactions:**
- **Click** → opens task detail panel
- **Drag** → manually move between phases (with confirmation for phase transitions that skip steps)
- **Right-click** → context menu (change agent, start bake-off, view worktree, etc.)

### 8.2 Task Detail Panel

When a card is clicked, a detail panel shows:

- **Header:** Task ID, title, priority, assigned agents
- **Phase timeline:** Visual progression through phases with timestamps
- **Artifacts tab:** All phase outputs — plan documents rendered as markdown, UX mockups displayed inline, test results, code review reports
- **Activity tab:** Chronological feed of agent notes and status changes
- **Code tab:** Git diff view of all changes in the worktree
- **Terminal tab:** Live TMUX session for interacting with the agent (for design iteration, etc.)
- **Bake-off tab** (if applicable): Side-by-side comparison of outputs from different agents

### 8.3 Agent Configuration Panel

A settings panel for managing agent definitions:

- Create/edit/delete agent definitions
- Configure CLI tool, model, and role prompt for each agent
- Set default agents per phase
- Configure phase-level settings (e.g., auto-fix P1s in code review, auto-promote on test pass)

### 8.4 Port Dashboard

A simple view showing:
- All allocated ports and which tasks own them
- Links to running services
- Health status of running services

### 8.5 Human Interaction Points

The UI must clearly surface moments where human input is needed:

| Phase | Human Action Required |
|-------|----------------------|
| Pending → Design | Approve to start (or auto-start if configured) |
| Design → Coding | Review and approve design artifacts |
| Code Review → Coding | Decide on P1/P2 auto-fix (if not pre-configured) |
| Manual Testing → Done | Approve or leave revision comments |
| Manual Testing → Coding | Leave comments triggering revision |

These should be surfaced as **prominent action buttons** on the card and in the detail panel, plus optional notifications (browser, email, Slack webhook — future).

---

## 9. CLI Tool Integration

Mark2 must support running agents via any CLI tool in **non-interactive mode**. Every agent process runs with:

- All permissions granted (no interactive confirmations)
- Stdout/stderr captured and streamed
- TMUX session wrapping for human observation and intervention
- Configurable timeout per phase
- Clean termination on phase transition

### 9.1 Supported CLI Tools (Initial)

| Tool | Non-Interactive Flag | Notes |
|------|---------------------|-------|
| Claude Code | `--dangerously-skip-permissions` or `--allowedTools` | Well-supported headless mode |
| Codex CLI | `--full-auto` | OpenAI's CLI |
| Gemini CLI | TBD | Google's CLI tool |
| OpenCode | TBD | Open-source option |

### 9.2 TMUX Session and Agent Naming

Each agent invocation runs inside a dedicated TMUX session with a descriptive name:

```
mark2_{task_id}_{agent_name}_{phase}
```

**Examples:**
- `mark2_TASK-42_claude-python-pro_coding`
- `mark2_TASK-42_gemini-fullstack_coding` (bake-off, same task)
- `mark2_TASK-42_codex-reviewer_review`
- `mark2_TASK-15_claude-architect_design`

The agent name is also propagated down to the CLI tool where supported:
- **Claude Code:** `--name` flag or session naming
- **Codex CLI:** Process name / environment variable
- **Gemini CLI:** TBD

This ensures that `tmux ls`, process lists, and the Mark2 UI terminal tab all show consistent, identifiable names. A human can `tmux attach -t mark2_TASK-42_claude-python-pro_coding` to observe or interact with any running agent.

---

## 10. Git Worktree Management

### 10.1 Lifecycle

1. **Creation:** When a task enters Design, Mark2 creates a worktree branching from the latest main.
2. **Usage:** All agent work happens within the worktree. Agents read/write files only within their worktree.
3. **Bake-off branching:** For bake-offs, each agent gets its own worktree branched from the same base commit.
4. **Merge:** On task completion (Done phase), Mark2 uses an LLM agent to merge the worktree branch into main, resolving any conflicts.
5. **Cleanup:** After successful merge, the worktree and its branch are deleted.

### 10.2 Naming Convention

```
{project_name}_{task_id}                    # Single agent
{project_name}_{task_id}_{agent_name}       # Bake-off
```

Worktree directories live adjacent to the main repo checkout (standard git worktree behavior).

### 10.3 Branch Naming

Corresponding branches follow the same naming convention:
```
mark2/{task_id}                             # Single agent
mark2/{task_id}/{agent_name}                # Bake-off
```

### 10.4 Merge Strategy

The default merge strategy is **rebase + squash merge**:

1. **Rebase:** Before merging, the worktree branch is rebased onto the latest `main`. This surfaces any conflicts introduced by other tasks that merged while this one was in progress.
2. **Conflict resolution:** If conflicts arise during rebase, an LLM agent resolves them. The agent has access to the task's design document and full implementation context, making it well-positioned to make correct resolution choices. If the agent cannot confidently resolve a conflict, the task is flagged for human intervention.
3. **Squash merge:** After successful rebase, all commits in the worktree branch are squash-merged into a single commit on `main`. The commit message is generated by an LLM agent and includes: task ID, task title, summary of changes, and a list of files modified.
4. **Cleanup:** After successful merge, the worktree directory and its branch are deleted.

**Optional: Preserve-commits merge.** For tasks where individual commit granularity matters (e.g., large features with meaningful intermediate commits), the user can configure a regular merge (rebase + fast-forward) instead of squash. This is a per-task setting togglable in the UI.

**Failure handling:** If the rebase or merge fails in a way the LLM cannot resolve, the task moves to a `merge_conflict` state (visible on the board) and the human is prompted to resolve manually.

---

## 11. Data Storage Architecture

### 11.1 Design Principle: File-Per-Entity, SQLite as Index

Mark2 uses a **file-per-entity** storage model inspired by systems like Beads. The canonical source of truth for all tasks, stories, and configuration is **individual YAML files committed to git**. A local SQLite database serves as a **derived index** for fast querying — it is `.gitignored` and rebuilt from the YAML files on demand.

This design enables:
- **Git-native collaboration** — multiple developers working on the same repo get task sync via `git pull`. Two developers editing different tasks produce clean merges. Edits to the same task produce standard text conflicts that git (or an LLM) can resolve.
- **Meaningful diffs** — `git log` shows exactly which tasks changed and how, in human-readable YAML.
- **No sync command needed** — `git pull` IS the sync mechanism. After pull, Mark2 automatically rebuilds its SQLite index from the YAML files.
- **Artifacts committed too** — design docs, test results, review reports, and UX mockups are all committed, making the full history of every task permanently available in the repo.

### 11.2 Persistent Entities

| Entity | Canonical Storage | Description |
|--------|-------------------|-------------|
| Story | `.mark2/stories/STORY-{id}.yaml` | Grouping of related tasks with shared context |
| Task | `.mark2/tasks/TASK-{id}.yaml` | All task metadata, state, relationships |
| Activity Log | `.mark2/tasks/TASK-{id}.activity.yaml` | Timestamped notes from agents and humans (separated to reduce merge noise) |
| Agent Definition | `.mark2/agents.yaml` | Named agent configurations |
| Phase Artifact | `.mark2/artifacts/TASK-{id}/{phase}/` | Documents, screenshots, test results stored as files |
| Project Config | `.mark2/config.yaml` | Project-level settings, phase defaults, auto-fix rules |
| Port Allocation | SQLite only (runtime state, not committed) | Current port reservations — ephemeral, per-machine |
| Worktree Record | SQLite only (runtime state, not committed) | Active worktrees — ephemeral, per-machine |

### 11.3 SQLite Index

The SQLite database (`.mark2/mark2.db`) is:
- **`.gitignored`** — never committed
- **Derived** — rebuilt from YAML files on startup, after `git pull`, or via `mark2 reindex`
- **Used for** — fast queries (board view, dependency resolution, filtering, search), atomic port allocation, worktree tracking
- **WAL mode** — concurrent readers with single writer for safe multi-agent access on the same machine
- Rebuild is fast: hundreds of YAML files parse in milliseconds

### 11.4 Directory Structure

```
.mark2/
├── config.yaml                    # Project configuration (committed)
├── agents.yaml                    # Agent definitions (committed)
├── context.json                   # Compact manifest for agent injection (committed)
├── mark2.db                       # SQLite index (gitignored, derived)
├── stories/
│   ├── STORY-1.yaml               # (committed)
│   └── STORY-2.yaml
├── tasks/
│   ├── TASK-1.yaml                # Task metadata (committed)
│   ├── TASK-1.activity.yaml       # Activity log (committed)
│   ├── TASK-2.yaml
│   ├── TASK-2.activity.yaml
│   └── ...
└── artifacts/
    ├── TASK-1/
    │   ├── design/
    │   │   ├── TASK-1_design.md   # (committed)
    │   │   └── TASK-1_ux_1.png    # (committed)
    │   ├── testing/
    │   │   └── TASK-1_test_results.json
    │   ├── review/
    │   │   └── TASK-1_review.md
    │   └── manual_testing/
    │       └── TASK-1_test_plan.md
    └── TASK-2/
        └── ...
```

### 11.5 Sync Behavior

| Event | Action |
|-------|--------|
| `mark2 init` | Create `.mark2/` structure, initialize empty SQLite index, add `mark2.db` to `.gitignore` |
| Mark2 server startup | Rebuild SQLite index from all YAML files |
| `git pull` (detected via hook or file watcher) | Incrementally update SQLite index from changed YAML files |
| `mark2 reindex` | Full rebuild of SQLite index from YAML files (manual recovery command) |
| Task/story mutation (API or UI) | Write to YAML file first (canonical), then update SQLite index, then `git add` the changed file |
| Agent activity log entry | Append to `.activity.yaml` file, update SQLite index |

---

## 12. Project Initialization

Running `mark2 init` in a repository sets up:

1. `.mark2/` directory structure (tasks/, stories/, artifacts/)
2. Default `config.yaml` with sensible defaults
3. Default `agents.yaml` with starter agent definitions
4. `context.json` manifest that agents will read
5. Empty SQLite index (`mark2.db`) added to `.gitignore`
6. Git hooks (optional) for auto-reindex after pull/merge

---

## 13. Non-Functional Requirements

### 13.1 Concurrency

- Multiple tasks must be able to run agents simultaneously
- Multiple bake-off agents on the same task must run concurrently
- The task database must handle concurrent reads/writes safely
- Port allocations must be atomic to prevent conflicts

### 13.2 Observability

- All agent stdout/stderr is captured and stored
- TMUX sessions are available for live observation
- Activity logs provide a persistent audit trail
- Phase transitions are logged with timestamps

### 13.3 Resilience

- Agent crashes should be detected and the task marked as failed (with option to retry)
- If the Mark2 server restarts, it should recover state from the database and resume monitoring active agents
- Worktrees should be cleaned up on failure (or flagged for manual cleanup)

### 13.4 Security

- Agents run with full filesystem permissions within their worktree
- Agents should NOT have access to other tasks' worktrees
- API/MCP access should be scoped to the current task (an agent can only update its own task)
- No secrets should be stored in `.mark2/` — use environment variables or external secret managers

### 13.5 Performance

- UI should load and render the board in under 2 seconds
- Phase transitions should begin within 5 seconds of trigger
- Worktree creation should complete within 10 seconds

---

## 14. Future Considerations (Out of Scope for V1)

These are explicitly **not** in scope for the initial build but are anticipated for future versions:

- **Notifications:** Slack, email, or browser push notifications when human action is needed
- **Multi-repo support:** Orchestrating tasks across multiple repositories
- **Remote agents:** Running agents on remote machines or in containers
- **Cost tracking:** Tracking API token usage and cost per task/agent
- **Analytics dashboard:** Metrics on agent performance, phase durations, bake-off win rates
- **Template tasks:** Predefined task templates for common patterns (new API endpoint, new UI page, bug fix, etc.)
- **PR integration:** Auto-creating GitHub/GitLab PRs instead of direct merge to main
- **Rollback:** Automatic rollback if a merged feature causes CI failures on main

---

## 15. Success Criteria

Mark2 V1 is successful if:

1. A user can create a task, assign an agent, and watch it progress through all phases to merge
2. Human approval gates work correctly at Design, Code Review, and Manual Testing
3. The coding → testing → code review loop functions automatically until quality gates pass
4. Bake-offs produce isolated outputs that can be compared side by side
5. Multiple tasks can run concurrently without worktree or port conflicts
6. Agents remain aware of the orchestration layer throughout their execution (no context drift)
7. The UI provides clear visibility into all active work and surfaces human action items prominently

---

## 16. Resolved Design Decisions

| # | Decision | Resolution | Rationale |
|---|----------|------------|-----------|
| 1 | **Application architecture** | Single unified Next.js app (TypeScript/Node) | One app serves both the frontend (React UI) and backend (API routes, MCP server, agent orchestration). No separate backend process. Simplifies deployment and development. |
| 2 | **Frontend framework** | Next.js with React | Leverages React component ecosystem, server-side rendering for the board view, and API routes for the backend — all in one TypeScript codebase. |
| 3 | **Database** | SQLite (WAL mode) as derived index; YAML files as canonical source | ACID-compliant, zero-ops. YAML files committed to git enable multi-developer sync via `git pull`. SQLite is gitignored and rebuilt from YAML on demand. See §11. |
| 4 | **Agent communication** | Both REST API and MCP server (embedded in main server) | REST API for the UI and general integrations. MCP server embedded in the same Next.js process for agent-native communication. Both backed by the same service layer. |
| 5 | **Bake-off winner selection** | Human picks | The human reviews outputs side-by-side in the UI and promotes one agent's work forward. No automated scoring in V1. |
| 6 | **Stories** | Yes — stories group related tasks | See §4.5. Stories provide a higher-level grouping for features that span multiple tasks. |
| 7 | **Max concurrent agents** | User-defined (no system-imposed limit) | The system imposes no artificial cap. Practical limits are hardware (CPU, RAM, disk I/O) and API rate limits for the underlying models. |
| 8 | **Design phase** | Mandatory for all tasks | Even trivial tasks produce a one-sentence plan. This ensures every task has a design artifact and the human always has an approval gate before code is written. |
| 9 | **Merge strategy** | Rebase + squash merge (default) | See §10.4. Worktree branch is rebased onto latest main, then squash-merged into a single clean commit. LLM agent handles conflict resolution during rebase. Optional: regular merge (preserving commits) for tasks where granularity matters. |
| 10 | **TMUX sessions** | One session per agent invocation, named descriptively | Session names follow the pattern `mark2_{task_id}_{agent_name}_{phase}` (e.g., `mark2_TASK-42_claude-python-pro_coding`). Agent names propagate down to the CLI tool where supported (e.g., Claude Code session naming). |
| 11 | **Artifact storage** | Committed to git (no LFS) | Artifacts (design docs, test results, review reports, UX mockups) are committed alongside task YAML files. Screenshots and mockups are not large enough to warrant Git LFS. Provides permanent history, meaningful diffs, and multi-developer visibility. |
| 12 | **Multi-developer sync** | File-per-entity YAML in git; SQLite as local derived index | Inspired by Beads. Each task/story is a separate YAML file committed to git. `git pull` is the sync mechanism. SQLite is gitignored and rebuilt locally. See §11. |
| 13 | **SQLite query layer** | Drizzle ORM | Lightweight, TypeScript-native, excellent SQLite support, type-safe queries without the weight of Prisma's code generation. Pairs well with the Next.js/TypeScript stack. |
| 14 | **YAML schema validation** | Zod schemas for all YAML entities | Every task, story, and config YAML file is validated against a Zod schema on read. Catches corruption, manual editing errors, and schema drift. Schemas serve double duty as TypeScript types. |
| 15 | **YAML parse failure handling** | Alert and rollback until user confirms | On reindex, if a YAML file fails to parse or validate, the system alerts the user in the UI, skips that entity, and preserves the last known good state in the SQLite index. The file is flagged as corrupted. The user must manually fix the file or confirm to ignore the error before the system treats it as resolved. |
| 16 | **Terminal integration** | xterm.js + WebSocket, with native terminal option | In-browser terminal via xterm.js connected to TMUX sessions over WebSocket for quick observation. Additionally, a "Open in Terminal" button that runs `tmux attach -t {session}` in the user's native terminal emulator for full interaction. |

---

*All open questions from prior revisions have been resolved. This PRD is ready for tech spec.*
