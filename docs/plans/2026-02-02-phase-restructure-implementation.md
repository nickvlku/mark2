# Phase Restructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure `final_testing` and `manual_testing` phases to separate test plan creation from execution, rename `manual_testing` to `run_test_plan`.

**Architecture:** The `final_testing` phase will run automated tests then create a manual test plan. The renamed `run_test_plan` phase will execute the plan using Playwright/curl and produce a report with checkboxes. A new transition allows `run_test_plan` → `fix_review` with accumulated context.

**Tech Stack:** TypeScript, Zod schemas, Next.js API routes, React components

---

## Task 1: Rename Phase Enum (`manual_testing` → `run_test_plan`)

**Files:**
- Modify: `src/lib/yaml/schemas.ts:5-21`

**Step 1: Update Phase enum**

```typescript
export const Phase = z.enum([
  'pending',
  'design',
  'coding',
  'testing',
  'code_review',
  'fix_review',
  'final_testing',
  'run_test_plan',
  'done',
]);
```

**Step 2: Update AssignablePhase enum**

```typescript
export const AssignablePhase = z.enum(['design', 'coding', 'testing', 'code_review', 'fix_review', 'final_testing', 'run_test_plan']);
export type AssignablePhase = z.infer<typeof AssignablePhase>;
export const ASSIGNABLE_PHASES: AssignablePhase[] = ['design', 'coding', 'testing', 'code_review', 'fix_review', 'final_testing', 'run_test_plan'];
```

**Step 3: Run TypeScript compiler to find all references**

Run: `npx tsc --noEmit 2>&1 | head -100`
Expected: List of files with type errors due to the rename

**Step 4: Commit**

```bash
git add src/lib/yaml/schemas.ts
git commit -m "refactor: rename manual_testing to run_test_plan in Phase enum"
```

---

## Task 2: Update Pipeline Transitions

**Files:**
- Modify: `src/lib/orchestration/pipeline.ts`

**Step 1: Update PHASE_ORDER**

```typescript
export const PHASE_ORDER: Phase[] = [
  'pending',
  'design',
  'coding',
  'testing',
  'code_review',
  'fix_review',
  'final_testing',
  'run_test_plan',
  'done',
];
```

**Step 2: Update END_TOKENS**

```typescript
export const END_TOKENS: Record<Phase, string[]> = {
  pending: [],
  design: ['[DESIGN_COMPLETED]'],
  coding: ['[CODING_COMPLETED]'],
  testing: ['[TESTING_PASSED]', '[TESTING_FAILED]'],
  code_review: ['[REVIEW_COMPLETED]', '[REVIEW_NEEDS_FIXES]'],
  fix_review: ['[FIX_REVIEW_COMPLETED]'],
  final_testing: ['[FINAL_TESTING_PASSED]', '[FINAL_TESTING_FAILED]'],
  run_test_plan: ['[RUN_TEST_PLAN_PASSED]', '[RUN_TEST_PLAN_FAILED]'],
  done: ['[TASK_COMPLETED]'],
};
```

**Step 3: Update TRANSITIONS**

Replace the `code_review` → `manual_testing` transition and add new `run_test_plan` → `fix_review` transition:

```typescript
export const TRANSITIONS: PhaseTransition[] = [
  // ... existing transitions up to code_review ...

  // code_review -> fix_review: review found issues needing fixes
  {
    from: 'code_review',
    to: 'fix_review',
    trigger: '[REVIEW_NEEDS_FIXES]',
  },

  // code_review -> final_testing: review completed (no issues)
  {
    from: 'code_review',
    to: 'final_testing',
    trigger: '[REVIEW_COMPLETED]',
  },

  // code_review -> coding: review found auto-fixable issues (loop back)
  {
    from: 'code_review',
    to: 'coding',
    trigger: '[REVIEW_COMPLETED]:autofix',
  },

  // fix_review -> final_testing: fixes completed
  {
    from: 'fix_review',
    to: 'final_testing',
    trigger: '[FIX_REVIEW_COMPLETED]',
  },

  // final_testing -> run_test_plan: tests passed, plan created
  {
    from: 'final_testing',
    to: 'run_test_plan',
    trigger: '[FINAL_TESTING_PASSED]',
  },

  // final_testing -> fix_review: tests failed
  {
    from: 'final_testing',
    to: 'fix_review',
    trigger: '[FINAL_TESTING_FAILED]',
  },

  // run_test_plan -> done: manual tests passed
  {
    from: 'run_test_plan',
    to: 'done',
    trigger: '[RUN_TEST_PLAN_PASSED]',
  },

  // run_test_plan -> fix_review: manual tests failed (new transition)
  {
    from: 'run_test_plan',
    to: 'fix_review',
    trigger: '[RUN_TEST_PLAN_FAILED]',
  },

  // done: terminal state
  {
    from: 'done',
    to: 'done',
    trigger: '[TASK_COMPLETED]',
  },
];
```

**Step 4: Commit**

```bash
git add src/lib/orchestration/pipeline.ts
git commit -m "refactor: update pipeline for run_test_plan and new transitions"
```

---

## Task 3: Update Phase Instructions

**Files:**
- Modify: `src/lib/orchestration/prompt-assembler.ts:108-180`

**Step 1: Update final_testing instructions**

```typescript
  final_testing: `You are in the FINAL TESTING phase. Your job is to:
1. Run the complete test suite after code review approval
2. Verify that all tests still pass after any review-related changes
3. Save test results: mark2_save_artifact(task_id, filename: "final-test-results.md", content: "...")

If any tests fail: mark2_signal_complete(task_id, token: "[FINAL_TESTING_FAILED]")

If all tests pass, create a manual test plan:
4. Analyze what was implemented and what needs manual verification
5. Create a human-readable test plan that a product manager could follow
6. Include browser tests (login flows, UI interactions) and API tests (endpoint verification)
7. Save the test plan: mark2_save_artifact(task_id, filename: "test-plan.md", content: "...")

Test plan format:
\`\`\`markdown
# Manual Test Plan for {TASK_ID}

## Summary
Brief description of what was implemented and needs testing.

## Prerequisites
- Development server running on port XXXX
- Any required test accounts or setup

## Test Cases

### 1. [Test Name]
1. Step one
2. Step two
**Expected:** What should happen
\`\`\`

After creating the test plan: mark2_signal_complete(task_id, token: "[FINAL_TESTING_PASSED]")`,
```

**Step 2: Rename and update manual_testing to run_test_plan**

```typescript
  run_test_plan: `You are in the RUN TEST PLAN phase. Your job is to:
1. Start any development servers needed to test the changes
2. Get the test plan: use mark2_get_latest_artifact(task_id, "test-plan") to retrieve it
3. Execute each test case in the plan:
   - For browser/UI tests: Use Playwright to automate the steps
   - For API tests: Use curl commands to verify endpoints
   - Use the allocated dev ports for all requests
4. Mark each test as passed (✅) or failed (❌)
5. For failed tests, capture error details and screenshots if applicable
6. Save the execution report: mark2_save_artifact(task_id, filename: "test-execution-report.md", content: "...")

Report format:
\`\`\`markdown
# Test Execution Report for {TASK_ID}

## Summary
- **Total:** X tests
- **Passed:** Y ✅
- **Failed:** Z ❌

## Results

### 1. [Test Name] ✅
- Executed via: Playwright/curl
- Result: Passed

### 2. [Test Name] ❌
- Executed via: Playwright/curl
- Result: Failed
- **Error:** Description of what went wrong
- **Details:** Stack trace, response body, or screenshot reference
\`\`\`

If all tests pass: mark2_signal_complete(task_id, token: "[RUN_TEST_PLAN_PASSED]")
If any tests fail: mark2_signal_complete(task_id, token: "[RUN_TEST_PLAN_FAILED]")`,
```

**Step 3: Update artifactPhases array**

```typescript
    const artifactPhases: Phase[] = ['design', 'coding', 'testing', 'code_review', 'final_testing', 'run_test_plan'];
```

**Step 4: Commit**

```bash
git add src/lib/orchestration/prompt-assembler.ts
git commit -m "feat: update phase instructions for final_testing and run_test_plan"
```

---

## Task 4: Rename Phase Handler File

**Files:**
- Rename: `src/lib/orchestration/phase-handlers/manual-testing.ts` → `src/lib/orchestration/phase-handlers/run-test-plan.ts`
- Modify: `src/lib/orchestration/phase-handlers/run-test-plan.ts`

**Step 1: Rename the file**

```bash
git mv src/lib/orchestration/phase-handlers/manual-testing.ts src/lib/orchestration/phase-handlers/run-test-plan.ts
```

**Step 2: Update exports and phase references**

```typescript
import fs from 'fs';
import type { Task } from '../../yaml/schemas';
import type { RoleConfig } from './run-phase';
import { CloneService } from '../../services/clone-service';
import { allocatePortsForTask } from '../../utils/port-allocator';
import { getDb } from '../../db';
import { activityEntries, portAllocations } from '../../db/schema';
import { TmuxManager } from '../tmux-manager';
import { PromptAssembler, type PromptContext } from '../prompt-assembler';
import type { CLIAdapter } from '../../adapters/types';
import type { AgentInvocationParams } from '../../../types';
import { ArtifactService } from '../../services/artifact-service';

export interface RunTestPlanResult {
  tmuxSession: string;
  allocatedPorts: number[];
  promptFile?: string;
}

/**
 * Handle the run_test_plan phase for a task.
 *
 * 1. Allocate ports for the task's dev server
 * 2. Get the test plan from previous phase
 * 3. Spawn the agent to execute the test plan
 */
export async function handleRunTestPlan(
  task: Task,
  agent: RoleConfig,
  adapter: CLIAdapter,
  _projectRoot: string,
  mark2Dir: string,
  apiBaseUrl: string,
  agentToken: string,
  basePort: number = 3000,
  portsPerTask: number = 10,
): Promise<RunTestPlanResult> {
  const db = getDb(mark2Dir);
  const now = new Date().toISOString();

  // Allocate ports for this task
  const allocatedPorts = allocatePortsForTask(task.id, basePort, portsPerTask);

  // Record port allocation
  db.insert(portAllocations)
    .values({
      task_id: task.id,
      ports_json: JSON.stringify(allocatedPorts),
      services_json: JSON.stringify({}),
      allocated_at: now,
    })
    .onConflictDoUpdate({
      target: portAllocations.task_id,
      set: {
        ports_json: JSON.stringify(allocatedPorts),
        allocated_at: now,
      },
    })
    .run();

  // Get the clone path for this task
  const cloneService = new CloneService(mark2Dir);
  const clonePath = cloneService.getClonePath(task.id);

  // Ensure clone exists
  if (!cloneService.cloneExists(task.id)) {
    await cloneService.createClone(task.id);
  }

  // Get design document and test plan for context
  const artifactService = new ArtifactService(mark2Dir);
  const { content: designDocument } = artifactService.getMostRecentContent(task.id, 'design');
  const { content: testPlan } = artifactService.getMostRecentContent(task.id, 'test-plan');

  const promptContext: PromptContext = {
    designDocument: designDocument || undefined,
  };

  // Assemble the prompts with split parts for CLI flags
  const assembler = new PromptAssembler(mark2Dir);
  const prompts = assembler.buildAgentAndTaskPrompts(task, agent, 'run_test_plan', promptContext);

  // Build invocation params with split prompts
  const params: AgentInvocationParams = {
    prompt: prompts.taskPrompt,
    orchestrationPrompt: prompts.orchestrationPrompt,
    agentPrompt: prompts.agentPrompt,
    taskPrompt: prompts.taskPrompt,
    agentSlug: prompts.agentName,
    workingDirectory: clonePath,
    agentName: agent.name,
    model: agent.model,
    taskId: task.id,
    phase: 'run_test_plan',
    apiBaseUrl,
    agentToken,
    timeoutMinutes: agent.timeout_minutes,
  };

  const command = adapter.buildCommand(params);
  const env = adapter.getEnvironment(params);
  const promptFile = adapter.getPromptFilePath?.(params);

  // Spawn the agent
  const tmuxManager = new TmuxManager(mark2Dir);
  const tmuxSession = await tmuxManager.spawnAgent({
    taskId: task.id,
    agentName: agent.name,
    phase: 'run_test_plan',
    command,
    workingDir: clonePath,
    env,
  });

  // Log activity
  db.insert(activityEntries)
    .values({
      task_id: task.id,
      timestamp: now,
      source: 'orchestration',
      type: 'phase_change',
      message: `Run test plan phase started. Ports allocated: ${allocatedPorts.join(', ')}. Agent "${agent.name}" spawned.`,
      metadata_json: JSON.stringify({
        agent: agent.name,
        tmux_session: tmuxSession,
        ports: allocatedPorts,
        has_test_plan: !!testPlan,
      }),
    })
    .run();

  return { tmuxSession, allocatedPorts, promptFile };
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "refactor: rename manual-testing.ts to run-test-plan.ts"
```

---

## Task 5: Update Orchestration Engine

**Files:**
- Modify: `src/lib/orchestration/engine.ts`

**Step 1: Update imports**

Replace:
```typescript
import { handleManualTesting } from './phase-handlers/manual-testing';
```

With:
```typescript
import { handleRunTestPlan } from './phase-handlers/run-test-plan';
```

**Step 2: Add run_test_plan → fix_review transition handling in processEndToken**

Add after the existing `[FINAL_TESTING_FAILED]` handling (around line 273):

```typescript
    // New flow: run_test_plan -> fix_review (manual tests failed)
    if (token === '[RUN_TEST_PLAN_FAILED]' && nextPhase === 'fix_review') {
      const artifactService = new ArtifactService(this.config.mark2Dir);
      // Get review comments (historical context)
      const { content: reviewComments } = artifactService.getMostRecentContent(taskId, 'review');
      // Get test execution report (what to focus on)
      const { content: testExecutionReport } = artifactService.getMostRecentContent(taskId, 'test-execution-report');
      loopContext = {
        reviewComments: reviewComments || undefined,
        testFailures: testExecutionReport || undefined,
      };
    }
```

**Step 3: Update startPhase switch case**

Replace the `manual_testing` case:
```typescript
      case 'run_test_plan': {
        const result = await handleRunTestPlan(
          task, role, adapter, projectRoot, mark2Dir, apiBaseUrl, agentToken,
          this.config.basePort, this.config.portsPerTask,
        );
        tmuxSession = result.tmuxSession;
        promptFile = result.promptFile;
        break;
      }
```

**Step 4: Update loop count increment logic in updateTaskPhase**

Update the `shouldIncrementLoop` condition to include the new transition:

```typescript
      const shouldIncrementLoop =
        // Legacy: coding from testing/code_review
        (newPhase === 'coding' && (task.phase === 'testing' || task.phase === 'code_review')) ||
        // New: fix_review from code_review, final_testing, or run_test_plan
        (newPhase === 'fix_review' && (task.phase === 'code_review' || task.phase === 'final_testing' || task.phase === 'run_test_plan'));
```

(Do this in both places where `shouldIncrementLoop` is calculated)

**Step 5: Commit**

```bash
git add src/lib/orchestration/engine.ts
git commit -m "feat: update engine for run_test_plan phase and transitions"
```

---

## Task 6: Update Fix Review Phase Handler

**Files:**
- Modify: `src/lib/orchestration/phase-handlers/fix-review.ts`

**Step 1: Update loopContext type and instructions comment**

```typescript
import type { Task } from '../../yaml/schemas';
import type { CLIAdapter } from '../../adapters/types';
import { runPhase, type RoleConfig } from './run-phase';
import type { PromptContext } from '../prompt-assembler';

export interface FixReviewResult {
  tmuxSession: string;
  promptFile?: string;
}

/**
 * Handle the fix_review phase for a task.
 *
 * This phase is entered when:
 * - Code review finds issues that need fixing
 * - Final testing fails
 * - Manual test execution (run_test_plan) fails
 *
 * The agent receives accumulated context:
 * - reviewComments: Original code review feedback
 * - testFailures: Test execution report or final test failures (focus on this if present)
 *
 * The agent should focus on the most recent artifact (testFailures if present, otherwise reviewComments).
 */
export async function handleFixReview(
  task: Task,
  role: RoleConfig,
  adapter: CLIAdapter,
  _projectRoot: string,
  mark2Dir: string,
  apiBaseUrl: string,
  agentToken: string,
  loopContext?: {
    reviewComments?: string;
    testFailures?: string;
  },
): Promise<FixReviewResult> {
  const result = await runPhase(task, role, adapter, mark2Dir, apiBaseUrl, agentToken, 'fix_review', {
    phaseContext: loopContext,
    getPromptContext: (_clonePath, task) => {
      const promptContext: PromptContext = {
        loopCount: task.loop_count > 0 ? task.loop_count : undefined,
      };
      return promptContext;
    },
    activityMessage: () =>
      `Fix review phase started. Agent will fetch review feedback and test results via MCP tools.`,
    activityMetadata: (ctx) => ({
      role: ctx.role.name,
      tmux_session: ctx.tmuxSession,
      phase: 'fix_review',
      loop_count: ctx.task.loop_count,
      has_review_comments: !!loopContext?.reviewComments,
      has_test_failures: !!loopContext?.testFailures,
    }),
    activitySource: (ctx) => ctx.role.name,
  });
  return { tmuxSession: result.tmuxSession, promptFile: result.promptFile };
}
```

**Step 2: Commit**

```bash
git add src/lib/orchestration/phase-handlers/fix-review.ts
git commit -m "feat: update fix_review to handle context from run_test_plan"
```

---

## Task 7: Update fix_review Phase Instructions

**Files:**
- Modify: `src/lib/orchestration/prompt-assembler.ts`

**Step 1: Update fix_review instructions**

```typescript
  fix_review: `You are in the FIX REVIEW phase. Your job is to:
1. Get the MOST RECENT feedback to address:
   - First check for test execution report: mark2_get_latest_artifact(task_id, "test-execution-report")
   - If no test execution report, get code review: mark2_get_latest_artifact(task_id, "review")
2. If test failures exist, also get historical context:
   - Previous fix artifacts: mark2_get_latest_artifact(task_id, "fix")
   - Original review comments: mark2_get_latest_artifact(task_id, "review")
3. Focus EXCLUSIVELY on the most recent issue:
   - If test-execution-report exists: Fix the failing manual tests
   - Otherwise: Address P0 and P1 code review issues
4. Make the necessary code changes
5. Commit your fixes: mark2_git_commit(task_id, message: "fix: address feedback from [source]")
6. Save a summary of what was fixed: mark2_save_artifact(task_id, filename: "fix-summary.md", content: "...")

When done, signal: mark2_signal_complete(task_id, token: "[FIX_REVIEW_COMPLETED]")`,
```

**Step 2: Commit**

```bash
git add src/lib/orchestration/prompt-assembler.ts
git commit -m "feat: update fix_review instructions to handle test execution reports"
```

---

## Task 8: Update API Route for Phase Transitions

**Files:**
- Modify: `src/app/api/tasks/[id]/phase/route.ts`

**Step 1: Update the transition handling for run_test_plan**

Find and replace `manual_testing` references:

```typescript
          // Coming back from run_test_plan - include test execution report
          else if (previousPhase === 'run_test_plan') {
            // Get accumulated context
            const { content: reviewComments } = artifactService.getMostRecentContent(id, 'review');
            const { content: testExecutionReport } = artifactService.getMostRecentContent(id, 'test-execution-report');
            loopContext = {
              reviewComments: reviewComments || undefined,
              testFailures: testExecutionReport || undefined,
            };
          }
```

**Step 2: Commit**

```bash
git add src/app/api/tasks/[id]/phase/route.ts
git commit -m "feat: update API route for run_test_plan phase transitions"
```

---

## Task 9: Update Config File

**Files:**
- Modify: `.mark2/config.yaml`

**Step 1: Update phase_defaults to swap roles and rename phase**

```yaml
phase_defaults:
  design:
    role: task-enhancer
    cli_tool: claude-code
    model: claude-opus-4-5
    auto_advance: false
  coding:
    role: expert-fullstack-coder
    cli_tool: claude-code
    model: claude-sonnet-4-5
    auto_advance: false
  testing:
    role: expert-test-engineer
    cli_tool: claude-code
    model: claude-sonnet-4-5
    auto_advance: false
  code_review:
    role: expert-code-reviewer
    cli_tool: claude-code
    model: claude-opus-4-5
    auto_advance: false
  fix_review:
    role: expert-test-engineer
    cli_tool: claude-code
    model: claude-opus-4-5
    auto_advance: false
  final_testing:
    role: expert-style-reviewer
    cli_tool: claude-code
    model: claude-sonnet-4-5
    auto_advance: false
  run_test_plan:
    role: expert-e2e-tester
    cli_tool: claude-code
    model: claude-opus-4-5
    auto_advance: false
```

**Step 2: Commit**

```bash
git add .mark2/config.yaml
git commit -m "feat: swap roles for final_testing and run_test_plan phases"
```

---

## Task 10: Update CLI Templates

**Files:**
- Modify: `cli/templates/config.yaml`

**Step 1: Update phase_defaults template**

Ensure the template matches the new phase name and role assignments (similar changes as Task 9).

**Step 2: Commit**

```bash
git add cli/templates/config.yaml
git commit -m "feat: update CLI config template for run_test_plan"
```

---

## Task 11: Update End Token Hook

**Files:**
- Modify: `cli/hooks/end-token-hook.ts`

**Step 1: Update any manual_testing references**

Search for `manual_testing` and replace with `run_test_plan`. Update token patterns if needed.

**Step 2: Commit**

```bash
git add cli/hooks/end-token-hook.ts
git commit -m "refactor: update end-token-hook for run_test_plan"
```

---

## Task 12: Update UI Components - Find All References

**Files:**
- Search all components for `manual_testing` references

**Step 1: Find all UI files with manual_testing**

```bash
grep -r "manual_testing" src/components/ --include="*.tsx" -l
```

Expected files:
- `src/components/board/Board.tsx`
- `src/components/board/Column.tsx`
- `src/components/shared/ActionBar.tsx`
- `src/components/shared/Badge.tsx`
- `src/components/detail/ArtifactsTab.tsx`
- `src/components/detail/PhaseOverridesTab.tsx`
- `src/components/detail/PhaseTimeline.tsx`
- `src/components/roles/EditRoleDialog.tsx`
- `src/components/roles/ImportRolesDialog.tsx`
- `src/components/roles/PhaseDefaultsSection.tsx`
- `src/components/roles/RolesPage.tsx`
- `src/components/roles/CreateRoleDialog.tsx`

**Step 2: Update each file**

Replace `manual_testing` with `run_test_plan` and update display text where appropriate (e.g., "Manual Testing" → "Run Test Plan").

**Step 3: Commit**

```bash
git add src/components/
git commit -m "refactor: rename manual_testing to run_test_plan in UI components"
```

---

## Task 13: Update Tests

**Files:**
- Modify: `tests/integration/pipeline/phase-transitions.test.ts`
- Modify: `tests/unit/schemas.test.ts`
- Modify: `tests/unit/pipeline.test.ts`

**Step 1: Update test files**

Replace `manual_testing` with `run_test_plan` in all test assertions and fixtures.

**Step 2: Run tests**

```bash
npm test
```

Expected: All tests pass

**Step 3: Commit**

```bash
git add tests/
git commit -m "test: update tests for run_test_plan phase rename"
```

---

## Task 14: Update Documentation

**Files:**
- Modify: `docs/TASK_LIFECYCLE.md`
- Modify: `docs/PRD.md`
- Modify: `docs/TECH_SPEC.md`
- Modify: `docs/PROMPTS.md`
- Modify: `docs/MARK2_DIRECTORY.md`
- Modify: `docs/CLI_COMMANDS.md`
- Modify: `docs/MCP_SERVER.md`

**Step 1: Update all documentation**

Replace `manual_testing` with `run_test_plan` and update descriptions to reflect the new phase purposes:
- `final_testing`: Runs automated tests, then creates manual test plan
- `run_test_plan`: Executes the test plan with Playwright/curl, produces checkbox report

**Step 2: Commit**

```bash
git add docs/
git commit -m "docs: update documentation for phase restructure"
```

---

## Task 15: Update Default Roles

**Files:**
- Modify: `src/lib/constants/default-roles.ts`

**Step 1: Update suggested_phases for roles**

Find roles that suggest `manual_testing` and update to `run_test_plan`.

**Step 2: Commit**

```bash
git add src/lib/constants/default-roles.ts
git commit -m "refactor: update default roles for run_test_plan"
```

---

## Task 16: Update Task Service

**Files:**
- Modify: `src/lib/services/task-service.ts`

**Step 1: Update any manual_testing references**

Search and replace `manual_testing` with `run_test_plan`.

**Step 2: Add artifact mapping for test-execution-report**

If there's artifact name mapping logic, add:
```typescript
'test-execution-report.md' -> phase: 'run_test_plan', name: 'test-execution-report'
```

**Step 3: Commit**

```bash
git add src/lib/services/task-service.ts
git commit -m "refactor: update task-service for run_test_plan"
```

---

## Task 17: Final Verification

**Step 1: Run TypeScript compiler**

```bash
npx tsc --noEmit
```

Expected: No errors

**Step 2: Run linter**

```bash
npm run lint
```

Expected: No errors

**Step 3: Run all tests**

```bash
npm test
```

Expected: All tests pass

**Step 4: Manual verification**

Start the dev server and verify:
1. UI shows "Run Test Plan" instead of "Manual Testing"
2. Phase transitions work correctly
3. New transitions (run_test_plan → fix_review) are functional

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address any remaining issues from phase restructure"
```

---

## Summary of Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/yaml/schemas.ts` | Modify | Rename enum value |
| `src/lib/orchestration/pipeline.ts` | Modify | Update phase order, tokens, transitions |
| `src/lib/orchestration/prompt-assembler.ts` | Modify | Update phase instructions |
| `src/lib/orchestration/phase-handlers/manual-testing.ts` | Rename | → `run-test-plan.ts` |
| `src/lib/orchestration/phase-handlers/run-test-plan.ts` | Modify | Update handler logic |
| `src/lib/orchestration/phase-handlers/fix-review.ts` | Modify | Handle accumulated context |
| `src/lib/orchestration/engine.ts` | Modify | Update imports, switch cases, transitions |
| `src/app/api/tasks/[id]/phase/route.ts` | Modify | Update transition handling |
| `.mark2/config.yaml` | Modify | Swap roles, rename phase |
| `cli/templates/config.yaml` | Modify | Update template |
| `cli/hooks/end-token-hook.ts` | Modify | Update phase references |
| `src/components/**/*.tsx` | Modify | Update UI references |
| `tests/**/*.test.ts` | Modify | Update test assertions |
| `docs/*.md` | Modify | Update documentation |
| `src/lib/constants/default-roles.ts` | Modify | Update suggested phases |
| `src/lib/services/task-service.ts` | Modify | Update phase references |
