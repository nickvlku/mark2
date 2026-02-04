# Task Lifecycle

This document describes the complete lifecycle of a Mark2 task, from creation to completion, including all phases, transitions, and the flow of artifacts between phases.

## Overview

A Mark2 task progresses through a series of **phases**, each handled by an AI agent. The flow is:

```
┌─────────┐     ┌────────┐     ┌─────────┐     ┌─────────────┐
│ pending │ ──► │ design │ ──► │ coding  │ ──► │   testing   │
└─────────┘     └────────┘     └─────────┘     └──────┬──────┘
                                                      │
                    ┌─────────────────────────────────┘
                    │
                    ▼
              ┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
              │ code_review │ ──► │ fix_review  │ ──► │  final_testing   │
              └──────┬──────┘     └──────┬──────┘     └────────┬─────────┘
                     │                   │                      │
                     │                   └──────────────────────┤
                     │                                          │
                     ▼                                          ▼
              ┌──────────────────┐                        ┌──────────┐
              │  run_test_plan  │ ◄──────────────────────┤          │
              └────────┬─────────┘                        │          │
                       │                                  │          │
                       ▼                                  │          │
                  ┌─────────┐                             │          │
                  │  done   │ ◄───────────────────────────┘          │
                  └─────────┘                                        │
                                                                     │
                                         (if tests fail)             │
                                    ┌────────────────────────────────┘
                                    │
                                    ▼
                              ┌─────────────┐
                              │ fix_review  │
                              └─────────────┘
```

## Phase Summary

| Phase | Purpose | Agent Role | End Tokens |
|-------|---------|------------|------------|
| `pending` | Waiting for blockers to resolve | None | None |
| `design` | Architecture and planning | System Architect | `[DESIGN_COMPLETED]` |
| `coding` | Implementation | Full-stack Developer | `[CODING_COMPLETED]` |
| `testing` | Write and run tests | Test Engineer | `[TESTING_PASSED]`, `[TESTING_FAILED]` |
| `code_review` | Review changes | Code Reviewer | `[REVIEW_COMPLETED]`, `[REVIEW_NEEDS_FIXES]` |
| `fix_review` | Address review feedback | Developer | `[FIX_REVIEW_COMPLETED]` |
| `final_testing` | Verify after fixes | Test Engineer | `[FINAL_TESTING_PASSED]`, `[FINAL_TESTING_FAILED]` |
| `run_test_plan` | Prepare for human QA | QA Analyst | `[RUN_TEST_PLAN_PASSED]` |
| `done` | Task complete | None | `[TASK_COMPLETED]` |

---

## Detailed Phase Descriptions

### 1. Pending

**Purpose:** Hold tasks that are blocked or not ready to start.

**What Happens:**
- Task waits for blockers to be resolved
- No agent is spawned
- Can be manually advanced to `design`

**Transitions:**
- `blockers_resolved` → **design** (automatic when blockers are empty)
- Manual kick → **design**

**No prompts** - this phase doesn't spawn an agent.

---

### 2. Design

**Purpose:** Create a comprehensive design document before implementation.

**What Happens:**
1. Agent analyzes task requirements
2. Produces a design document covering:
   - Architecture decisions
   - Data models
   - API contracts
   - File changes needed
   - Risks and edge cases
3. Saves design artifact via `mark2_save_artifact`
4. Signals completion

**Agent Role:** System Architect (e.g., `expert-system-architect`)

**Artifacts Produced:**
- `design.md` - The design document

**Prompts:** See [Design Phase Prompt](./PROMPTS.md#design-phase)

**Transitions:**
- `[DESIGN_COMPLETED]` → **coding**

---

### 3. Coding

**Purpose:** Implement the changes described in the design document.

**What Happens:**
1. Agent reads the design document
2. Implements the required changes
3. Follows project coding conventions
4. Commits changes via `mark2_git_commit`
5. Saves a coding summary artifact
6. Signals completion

**Agent Role:** Full-stack Developer (e.g., `expert-fullstack-coder`)

**Artifacts Produced:**
- `coding-summary.md` - Implementation summary
- Git commits on the task branch

**Prompts:** See [Coding Phase Prompt](./PROMPTS.md#coding-phase)

**Transitions:**
- `[CODING_COMPLETED]` → **testing**

**Loop Back:**
- If this phase is re-entered from `testing` (tests failed), the agent receives test failure context

---

### 4. Testing

**Purpose:** Verify the implementation with automated tests.

**What Happens:**
1. Agent runs existing test suite
2. Writes new tests for the changes
3. Ensures adequate coverage for edge cases
4. Saves test results artifact
5. Signals pass or fail

**Agent Role:** Test Engineer (e.g., `expert-test-engineer`)

**Artifacts Produced:**
- `test-results.md` - Test execution results

**Prompts:** See [Testing Phase Prompt](./PROMPTS.md#testing-phase)

**Transitions:**
- `[TESTING_PASSED]` → **code_review**
- `[TESTING_FAILED]` → **coding** (loop back with test failure context)

---

### 5. Code Review

**Purpose:** Review changes for correctness, security, and style.

**What Happens:**
1. Agent gets the full diff from `origin/main`
2. Reads the design document for context
3. Reviews all changes for:
   - Correctness and logic errors
   - Security vulnerabilities
   - Performance issues
   - Style violations
4. Classifies issues by severity:
   - **P0** - Must fix (blockers)
   - **P1** - Should fix (important)
   - **P2** - Nice to fix (minor)
5. Saves review artifact
6. Signals whether fixes are needed

**Agent Role:** Code Reviewer (e.g., `expert-code-reviewer`)

**Artifacts Produced:**
- `review.md` - Code review with categorized issues

**Prompts:** See [Code Review Phase Prompt](./PROMPTS.md#code-review-phase)

**Transitions:**
- `[REVIEW_COMPLETED]` → **run_test_plan** (no issues found)
- `[REVIEW_NEEDS_FIXES]` → **fix_review** (issues need fixing)

---

### 6. Fix Review

**Purpose:** Address issues identified in code review.

**What Happens:**
1. Agent fetches the **most recent** review via `mark2_get_latest_artifact`
2. If tests failed, also fetches test results
3. Addresses all P0 and P1 issues
4. Makes targeted code changes
5. Commits fixes via `mark2_git_commit`
6. Signals completion

**Agent Role:** Developer (e.g., `expert-fullstack-coder` or `expert-test-engineer`)

**Key Behavior:**
- Only fetches the latest review, ignoring older ones
- Focuses on P0 and P1 issues (P2 can be skipped)
- Increments `loop_count` when entering this phase

**Prompts:** See [Fix Review Phase Prompt](./PROMPTS.md#fix-review-phase)

**Transitions:**
- `[FIX_REVIEW_COMPLETED]` → **code_review** (re-review the fixes)

**Loop Protection:**
- `max_loop_count` (default: 5) limits how many times a task can loop
- Prevents infinite fix/review cycles

---

### 7. Final Testing

**Purpose:** Verify tests still pass after review-related changes.

**What Happens:**
1. Agent runs the complete test suite
2. Verifies no regressions from fix_review changes
3. Saves final test results artifact
4. Signals pass or fail

**Agent Role:** Test Engineer (e.g., `expert-e2e-tester`)

**Artifacts Produced:**
- `final-test-results.md` - Final test execution results

**Prompts:** See [Final Testing Phase Prompt](./PROMPTS.md#final-testing-phase)

**Transitions:**
- `[FINAL_TESTING_PASSED]` → **run_test_plan**
- `[FINAL_TESTING_FAILED]` → **fix_review** (loop back to fix issues)

---

### 8. Run Test Plan

**Purpose:** Prepare for human QA testing.

**What Happens:**
1. Agent starts any development servers needed
2. Generates a test plan for human testers
3. Documents which ports are in use
4. Saves test plan artifact
5. Signals ready for human testing

**Agent Role:** QA Analyst (e.g., `expert-qa-analyst`)

**Artifacts Produced:**
- `test-plan.md` - Step-by-step manual testing instructions

**Port Allocation:**
- Ports are allocated from `base_port` (default: 3000)
- Each task gets `ports_per_task` (default: 10) ports

**Prompts:** See [Run Test Plan Phase Prompt](./PROMPTS.md#manual-testing-phase)

**Transitions:**
- `[RUN_TEST_PLAN_PASSED]` → **done**

---

### 9. Done

**Purpose:** Task complete, ready for merge.

**What Happens:**
1. Task is marked as complete
2. Clone can be cleaned up (optional)
3. Branch is ready for PR/merge

**Artifacts:** None produced

**This is a terminal state.** The task lifecycle is complete.

---

## Transition Diagram

```
                                    ┌────────────────────────────────────────┐
                                    │                                        │
                                    ▼                                        │
┌─────────┐   blockers    ┌────────────┐  [DESIGN_    ┌─────────┐           │
│ pending │ ─────────────►│   design   │──COMPLETED]─►│ coding  │◄──────────┤
└─────────┘   resolved    └────────────┘              └────┬────┘           │
                                                           │                │
                                         [CODING_COMPLETED]│                │
                                                           ▼                │
                                                     ┌─────────┐            │
                                                     │ testing │            │
                                                     └────┬────┘            │
                                                          │                 │
                          ┌───────────[TESTING_FAILED]────┘                 │
                          │                               │                 │
                          │             [TESTING_PASSED]  │                 │
                          │                               ▼                 │
                          │                        ┌─────────────┐          │
                          └───────────────────────►│ code_review │          │
                                                   └──────┬──────┘          │
                                                          │                 │
                         ┌────[REVIEW_COMPLETED]──────────┤                 │
                         │                                │                 │
                         │           [REVIEW_NEEDS_FIXES] │                 │
                         │                                ▼                 │
                         │                         ┌─────────────┐          │
                         │                         │ fix_review  │──────────┘
                         │                         └──────┬──────┘   [FIX_REVIEW_
                         │                                │          COMPLETED]
                         │                                │           goes back
                         │                                │          to code_review
                         │                                │
                         │    [FINAL_TESTING_FAILED]      │
                         │         ┌──────────────────────┤
                         │         │                      │
                         │         ▼                      │
                         │  ┌─────────────┐               │
                         │  │ fix_review  │◄──────────────┘
                         │  └─────────────┘
                         │
                         │  [FINAL_TESTING_PASSED]
                         │         │
                         ▼         ▼
                  ┌──────────────────┐
                  │  run_test_plan  │
                  └────────┬─────────┘
                           │
                           │ [RUN_TEST_PLAN_PASSED]
                           ▼
                      ┌─────────┐
                      │  done   │
                      └─────────┘
```

---

## Artifact Flow

Artifacts flow between phases, providing context for subsequent agents:

```
design
  │
  └─► design.md ─────────────────────────────────────────────┐
                                                              │
coding                                                        │
  │                                                           │
  └─► coding-summary.md                                       │
  └─► git commits                                             │
                                                              │
testing                                                       │
  │                                                           │
  └─► test-results.md ───────────────────────┐                │
                                             │                │
code_review                                  │                │
  │                                          │                │
  │◄─────────────────────────────────────────┴────────────────┘
  │        (reads design.md for context)
  │
  └─► review.md ─────────────────────┐
                                     │
fix_review                           │
  │                                  │
  │◄─────────────────────────────────┘
  │        (reads latest review.md)
  │
  └─► (code changes, commits)
                │
                ▼
          code_review (re-review)
                │
                └─► review.md (new)
                          │
                          ▼
                   final_testing
                          │
                          └─► final-test-results.md
                                       │
                                       ▼
                               run_test_plan
                                       │
                                       └─► test-plan.md
```

---

## Clone Lifecycle

Each task gets an isolated git clone for development:

```
1. Task Created (pending)
   └── No clone yet

2. Design Phase Starts
   └── Clone created: .mark2/clones/{TASK-ID}/
       ├── Full git repository
       ├── Branch: mark2/{TASK-ID}
       └── All code changes happen here

3. Throughout Lifecycle
   └── Agents work in the clone
   └── Commits accumulate on task branch
   └── Clone persists across phases

4. Task Complete (done)
   └── Branch ready for merge
   └── Clone can be deleted after merge
```

See [MARK2_DIRECTORY.md](./MARK2_DIRECTORY.md#clones-and-isolation) for details.

---

## Configuration Options

### auto_advance

Controls automatic phase transitions.

```yaml
# In task definition
auto_advance: true   # (default) Automatically transition on end token
auto_advance: false  # Require manual approval for each transition
```

When `false`, the agent completes work but doesn't trigger transitions.

### auto_approve

Controls whether phase completion requires human approval.

```yaml
# In task definition
auto_approve: true   # Automatically approve phase transitions
auto_approve: false  # (default) Wait for human approval
```

### max_loop_count

Limits the number of fix/review cycles.

```yaml
# In config.yaml
max_loop_count: 5  # (default) Maximum times a task can loop
```

Prevents infinite loops if the agent can't satisfy the reviewer.

### auto_fix

Controls automatic fixing by severity.

```yaml
# In config.yaml
auto_fix:
  P0: true   # Auto-fix P0 issues
  P1: false  # Don't auto-fix P1
  P2: false  # Don't auto-fix P2
```

---

## Starting a Task

### Via UI

1. Create task in Mark2 UI
2. Click "Start Design" to begin

### Via API

```bash
# Create task
curl -X POST http://localhost:3100/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "My Task", "description": "...", "created_by": "human"}'

# Start phase
curl -X POST http://localhost:3100/api/tasks/TASK-1/phase \
  -H "Content-Type: application/json" \
  -d '{"action": "start", "phase": "design"}'
```

### Via CLI

```bash
npm run mark2 start TASK-1
```

---

## Monitoring Progress

### Activity Log

All phase transitions, agent actions, and artifacts are logged:

```yaml
# .mark2/tasks/TASK-1.activity.yaml
task_id: TASK-1
entries:
  - timestamp: 2026-01-31T10:00:00.000Z
    source: orchestration
    type: phase_change
    message: 'Phase transition: pending -> design'
  - timestamp: 2026-01-31T10:05:00.000Z
    source: agent
    type: artifact
    message: 'Design document saved'
```

### UI Dashboard

The Mark2 UI shows:
- Current phase
- Phase history
- Artifacts for each phase
- Activity timeline
- TMUX session output

### Terminal Streaming

Live agent output is streamed via WebSocket to the UI.

---

## Error Handling

### Agent Crash

If an agent crashes without emitting an end token:
1. TMUX session is detected as dead
2. Session is marked as `failed` in database
3. Activity log records the crash
4. Task remains in current phase
5. Can be manually restarted

### Phase Timeout

Each role has a `timeout_minutes` setting (default: 60).
- Timeouts are not currently enforced automatically
- Can be monitored via activity timestamps

### Loop Limit

When `loop_count` exceeds `max_loop_count`:
- Task should be reviewed manually
- Consider splitting into smaller tasks
- May indicate unclear requirements
