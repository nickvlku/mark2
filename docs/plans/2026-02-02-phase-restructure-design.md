# Phase Restructure: Create & Run Test Plan

## Overview

Restructure `final_testing` and `manual_testing` phases to separate test plan creation from execution.

**Phase Flow (before):**
```
... → code_review → fix_review → final_testing → manual_testing → done
                                 (run tests)      (create plan,
                                                   start servers)
```

**Phase Flow (after):**
```
... → code_review → fix_review → final_testing → run_test_plan → done
                    ↑            (run tests,      (execute plan,
                    |             create plan)     mark checkboxes)
                    └─────────────────────────────┘
                         (on failure, with error report)
```

## Key Changes

1. **`final_testing`** - Adds test plan creation after automated tests pass
2. **`manual_testing` → `run_test_plan`** - Renamed, now executes the plan with Playwright/curl
3. **Role swap** - Style reviewer creates plan, E2E tester executes it
4. **New artifact** - Test execution report with checkboxes and summary
5. **`fix_review`** - Accepts accumulated context (review comments, previous fixes, test execution report)
6. **UI** - "Back to Fix Review" button from `run_test_plan` on failure

## Phase Details

### `final_testing` Phase Changes

**Current behavior:**
- Run complete test suite
- Signal `[FINAL_TESTING_PASSED]` or `[FINAL_TESTING_FAILED]`
- Save `final-test-results.md` artifact

**New behavior:**
- Run complete test suite (unchanged)
- If tests fail → Signal `[FINAL_TESTING_FAILED]` (unchanged)
- If tests pass → Create manual test plan, then signal `[FINAL_TESTING_PASSED]`
- Save two artifacts: `final-test-results.md` and `test-plan.md`

**Role change:** `expert-e2e-tester` → `expert-style-reviewer`

**Test plan format** (human-readable for PMs):
```markdown
# Manual Test Plan for TASK-X

## Summary
Brief description of what was implemented and needs testing.

## Prerequisites
- Development server running on port XXXX
- User account with admin privileges (if applicable)

## Test Cases

### 1. User can log in with valid credentials
1. Navigate to /login
2. Enter username "testuser" and password "password123"
3. Click "Sign In"
4. **Expected:** Redirected to dashboard, welcome message shows username

### 2. API returns user list
1. Call GET /api/users with valid auth token
2. **Expected:** 200 response with array of user objects
```

### `run_test_plan` Phase (renamed from `manual_testing`)

**Current behavior (`manual_testing`):**
- Start development servers
- Generate test plan
- Report which ports are in use
- Signal `[MANUAL_TESTING_READY]`

**New behavior (`run_test_plan`):**
- Start development servers (keep this)
- Read `test-plan.md` artifact from previous phase
- Execute each test case:
  - **Browser tests** → Use Playwright (navigate, click, verify)
  - **API tests** → Use curl commands
  - Leverage allocated dev ports
- Produce `test-execution-report.md` with checkboxes and results
- Signal `[RUN_TEST_PLAN_PASSED]` or `[RUN_TEST_PLAN_FAILED]`

**Role change:** `expert-style-reviewer` → `expert-e2e-tester`

**Test execution report format:**
```markdown
# Test Execution Report for TASK-X

## Summary
- **Total:** 8 tests
- **Passed:** 6 ✅
- **Failed:** 2 ❌

## Results

### 1. User can log in with valid credentials ✅
- Executed via: Playwright
- Result: Passed

### 2. API returns user list ❌
- Executed via: curl
- Result: Failed
- **Error:** Expected 200, got 401 Unauthorized
- **Details:** Auth token was not accepted, response body: {"error": "invalid_token"}
```

### `fix_review` Phase Changes

**Context accumulation:**
```
Coming from code_review:
  - reviewComments ← focus on this (latest)

Coming from run_test_plan:
  - reviewComments (what code review flagged)
  - previous fix_review artifacts (what was fixed and how)
  - testExecutionReport ← focus on this (latest)
```

**Instructions update:** Focus exclusively on the most recent artifact. Previous artifacts are provided for context only.

### UI Changes

- When task is in `run_test_plan` phase with `[RUN_TEST_PLAN_FAILED]`:
  - Show "Back to Fix Review" button
  - Clicking sends task to `fix_review` with accumulated context

## Files to Change

**Schema & Types:**
- `src/lib/yaml/schemas.ts` - Rename `manual_testing` → `run_test_plan` in Phase enum and AssignablePhase
- `src/types/index.ts` - Update `PhaseContext` interface to include `testExecutionReport`

**Pipeline & Transitions:**
- `src/lib/orchestration/pipeline.ts` - Update `PHASE_ORDER`, `TRANSITIONS`, `END_TOKENS` for renamed phase and new transition

**Phase Instructions:**
- `src/lib/orchestration/prompt-assembler.ts` - Update `PHASE_INSTRUCTIONS` for `final_testing`, `run_test_plan`, and `fix_review`

**Phase Handlers:**
- `src/lib/orchestration/phase-handlers/final-testing.ts` - Add test plan creation after tests pass
- `src/lib/orchestration/phase-handlers/manual-testing.ts` - Rename file to `run-test-plan.ts`, rewrite to execute plan with Playwright/curl
- `src/lib/orchestration/phase-handlers/fix-review.ts` - Accept accumulated context, focus on latest artifact

**Orchestration Engine:**
- `src/lib/orchestration/engine.ts` - Update phase routing for renamed phase

**Services:**
- `src/lib/services/task-service.ts` - Update artifact mapping for new `test-execution-report.md`
- `src/lib/services/artifact-service.ts` - May need updates for retrieving accumulated artifacts

**API Routes:**
- `src/app/api/tasks/[id]/phase/route.ts` - Handle new transition, pass accumulated context

**UI:**
- Task detail component - Add "Back to Fix Review" button when `run_test_plan` fails

**Config:**
- `.mark2/config.yaml` - Update phase_defaults to swap roles, rename phase key

**Templates:**
- `cli/templates/context.json` - Update artifact naming if needed
