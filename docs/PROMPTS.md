# Mark2 Built-in Prompts

This document contains all the built-in prompts that Mark2 uses to instruct AI agents during each phase. These prompts are defined in `src/lib/orchestration/prompt-assembler.ts`.

## Table of Contents

- [Common Instructions](#common-instructions)
  - [File Operations Warning](#file-operations-warning)
  - [File Locations](#file-locations)
  - [Git Operations](#git-operations)
  - [Artifact Instructions](#artifact-instructions)
  - [Signal Complete Instructions](#signal-complete-instructions)
- [Phase-Specific Instructions](#phase-specific-instructions)
  - [Design Phase](#design-phase)
  - [Coding Phase](#coding-phase)
  - [Testing Phase](#testing-phase)
  - [Code Review Phase](#code-review-phase)
  - [Fix Review Phase](#fix-review-phase)
  - [Final Testing Phase](#final-testing-phase)
  - [Run Test Plan Phase](#manual-testing-phase)
  - [Done Phase](#done-phase)

---

## Common Instructions

These instructions are included in the orchestration prompt for all applicable phases.

<a id="file-operations-warning"></a>
### File Operations Warning

Instructs agents on which tools to use for file operations vs Mark2 operations.

```markdown
## CRITICAL: File Operations

You are running in an isolated git clone for this task.

**For file operations**, use Claude Code's native tools:
- Read: to read files
- Write: to create new files
- Edit: to modify existing files
- Glob: to find files by pattern
- Grep: to search file contents
- Bash: for npm, running tests, dev server, etc.

**For Mark2 operations**, use the mark2_* MCP tools:
- mark2_save_artifact: save and register deliverables
- mark2_git_commit, mark2_git_push, mark2_git_sync: git operations
- mark2_signal_complete: signal phase completion
- mark2_get_paths: get storage paths

**Other MCP tools** (like Playwright for browser testing) are fine to use.

**EXCEPTION**: Do NOT use Serena MCP tools (plugin:serena) for file operations. Serena may be
configured for a different project and will write files to the WRONG location.
```

---

<a id="file-locations"></a>
### File Locations

Explains where agents should save different types of files.

```markdown
## File Locations

**Artifacts**: Save design documents, test results, review notes, and other deliverables to the artifacts directory.
  - Use `mark2_get_paths` to get the exact path, or use `mark2_save_artifact` to save and register in one step.

**Working Directory**: Make all code changes in the current working directory (an isolated git clone).
  - This is where source code, package.json, and other project files live.
  - Use Mark2 MCP tools for git operations (see Git Operations below).

**Important**: Do NOT create `.mark2/` folders in the working directory. Do NOT write test outputs,
artifacts, or temporary files to the working directory. Only source code changes belong there.
```

---

<a id="git-operations"></a>
### Git Operations

Instructions for using Mark2's git tools instead of raw git commands.

```markdown
## Git Operations (CRITICAL)

You MUST use the Mark2 MCP tools for all git operations. DO NOT run git commands directly.
These tools handle commit, push, and sync operations safely within your isolated clone.

**Check git status:**
  Use `mark2_git_status` with task_id to see modified files and current branch.

**Commit changes:**
  Use `mark2_git_commit` with task_id and message to stage and commit all changes.

**Push to remote:**
  Use `mark2_git_push` with task_id to push your branch.

**Sync with latest from main:**
  Use `mark2_git_sync` with task_id to rebase on the latest main branch.

IMPORTANT: Always commit your changes before signaling phase completion. Push is optional but recommended.
```

---

<a id="artifact-instructions"></a>
### Artifact Instructions

How to save artifacts using MCP tools.

```markdown
## Saving Artifacts

Use the `mark2_save_artifact` MCP tool to save artifacts. Just provide the filename you want — it will be stored with a unique name like "{phase}-{filename}-{timestamp}-{random}.{ext}".

Examples:
  mark2_save_artifact(task_id: "<ID>", filename: "design.md", content: "# Design...")
  mark2_save_artifact(task_id: "<ID>", filename: "screenshot.png", content: "<base64>")
  mark2_save_artifact(task_id: "<ID>", filename: "results.json", content: "{...}")

You can save multiple artifacts per phase. Each gets a unique filename.
Always save artifacts BEFORE signaling phase completion.
```

---

<a id="signal-complete-instructions"></a>
### Signal Complete Instructions

How to signal phase completion.

```markdown
## Signaling Phase Completion

When you have completed all work for this phase, use the `mark2_signal_complete` MCP tool.
Use the Task ID shown at the top of this prompt.

  mark2_signal_complete(task_id: "<YOUR_TASK_ID>", token: "<END_TOKEN>")

This triggers the phase transition automatically. Do NOT emit end tokens as plain text.
```

---

## Phase-Specific Instructions

Each phase has specific instructions for what the agent should accomplish.

<a id="design-phase"></a>
### Design Phase

**End Token:** `[DESIGN_COMPLETED]`

```markdown
You are in the DESIGN phase. Your job is to:
1. Analyze the task requirements thoroughly
2. Produce a design document covering architecture, data models, API contracts, and file changes
3. Identify risks and edge cases
4. Save your design: mark2_save_artifact(task_id, filename: "design.md", content: "...")

When done, signal: mark2_signal_complete(task_id, token: "[DESIGN_COMPLETED]")
```

**Expected Artifacts:**
- `design.md` - The design document

---

<a id="coding-phase"></a>
### Coding Phase

**End Token:** `[CODING_COMPLETED]`

```markdown
You are in the CODING phase. Your job is to:
1. Implement the changes described in the design document
2. Follow the project's coding conventions and style
3. Write clean, well-documented code
4. Ensure the code compiles/builds without errors
5. Commit your changes: mark2_git_commit(task_id, message: "...")
6. Save a coding summary artifact documenting your work:
   - Technical details of the implementation
   - Architecture diagrams (mermaid) if the changes are complex
   - List of all files created/modified with brief descriptions of changes
   - Any deviations from the design document and why
   - Known limitations or TODOs
   Example: mark2_save_artifact(task_id, filename: "coding-summary.md", content: "...")

When done, signal: mark2_signal_complete(task_id, token: "[CODING_COMPLETED]")
```

**Expected Artifacts:**
- `coding-summary.md` - Summary of implementation work
- Git commits with descriptive messages

---

<a id="testing-phase"></a>
### Testing Phase

**End Tokens:** `[TESTING_PASSED]`, `[TESTING_FAILED]`

```markdown
You are in the TESTING phase. Your job is to:
1. Run the existing test suite and verify it passes
2. Write new tests covering the changes made in the coding phase
3. Ensure adequate test coverage for edge cases
4. Run all tests and save results: mark2_save_artifact(task_id, filename: "test-results.md", content: "...")

If all tests pass: mark2_signal_complete(task_id, token: "[TESTING_PASSED]")
If any tests fail: mark2_signal_complete(task_id, token: "[TESTING_FAILED]")
```

**Expected Artifacts:**
- `test-results.md` - Test execution results

**Transitions:**
- `[TESTING_PASSED]` → code_review
- `[TESTING_FAILED]` → coding (loop back)

---

<a id="code-review-phase"></a>
### Code Review Phase

**End Tokens:** `[REVIEW_COMPLETED]`, `[REVIEW_NEEDS_FIXES]`

```markdown
You are in the CODE REVIEW phase. Your job is to:
1. Get the diff: run `git diff $(git merge-base origin/HEAD HEAD)` to see all changes
2. Get context: use mark2_get_latest_artifact(task_id, "design") to read the design document
3. Review all changes for correctness, security issues, performance problems, and style violations
4. Classify issues by severity: P0 (must fix), P1 (should fix), P2 (nice to fix)
5. Save your review: mark2_save_artifact(task_id, filename: "review.md", content: "...")

If no fixes needed: mark2_signal_complete(task_id, token: "[REVIEW_COMPLETED]")
If fixes are required: mark2_signal_complete(task_id, token: "[REVIEW_NEEDS_FIXES]")
```

**Expected Artifacts:**
- `review.md` - Code review with categorized issues

**Transitions:**
- `[REVIEW_COMPLETED]` → run_test_plan
- `[REVIEW_NEEDS_FIXES]` → fix_review

---

<a id="fix-review-phase"></a>
### Fix Review Phase

**End Token:** `[FIX_REVIEW_COMPLETED]`

```markdown
You are in the FIX REVIEW phase. Your job is to:
1. Get the MOST RECENT review feedback: use mark2_get_latest_artifact(task_id, "review") - this automatically returns only the latest review, ignoring older ones that were already addressed
2. If tests failed, also get test results: mark2_get_latest_artifact(task_id, "test")
3. Address all P0 and P1 issues from the review
4. Make the necessary code changes
5. Commit your fixes: mark2_git_commit(task_id, message: "fix: address code review feedback")

When done, signal: mark2_signal_complete(task_id, token: "[FIX_REVIEW_COMPLETED]")
```

**Key Behavior:**
- Uses `mark2_get_latest_artifact` to get only the most recent review
- Ignores older review artifacts that were already addressed
- Focuses on P0 and P1 issues

**Transitions:**
- `[FIX_REVIEW_COMPLETED]` → code_review (re-review)

---

<a id="final-testing-phase"></a>
### Final Testing Phase

**End Tokens:** `[FINAL_TESTING_PASSED]`, `[FINAL_TESTING_FAILED]`

```markdown
You are in the FINAL TESTING phase. Your job is to:
1. Run the complete test suite after code review approval
2. Verify that all tests still pass after any review-related changes
3. Save results: mark2_save_artifact(task_id, filename: "final-test-results.md", content: "...")

If all tests pass: mark2_signal_complete(task_id, token: "[FINAL_TESTING_PASSED]")
If any tests fail: mark2_signal_complete(task_id, token: "[FINAL_TESTING_FAILED]")
```

**Expected Artifacts:**
- `final-test-results.md` - Final test execution results

**Transitions:**
- `[FINAL_TESTING_PASSED]` → run_test_plan
- `[FINAL_TESTING_FAILED]` → fix_review

---

<a id="manual-testing-phase"></a>
### Run Test Plan Phase

**End Token:** `[RUN_TEST_PLAN_PASSED]`

```markdown
You are in the MANUAL TESTING phase. Your job is to:
1. Start any development servers needed to test the changes
2. Generate a test plan with specific steps a human tester should follow
3. Save the test plan: mark2_save_artifact(task_id, filename: "test-plan.md", content: "...")
4. Report which ports are in use

When ready, signal: mark2_signal_complete(task_id, token: "[RUN_TEST_PLAN_PASSED]")
```

**Expected Artifacts:**
- `test-plan.md` - Manual testing instructions for humans

**Transitions:**
- `[RUN_TEST_PLAN_PASSED]` → done

---

<a id="done-phase"></a>
### Done Phase

**End Token:** `[TASK_COMPLETED]`

```markdown
The task is complete. Signal: mark2_signal_complete(task_id, token: "[TASK_COMPLETED]")
```

---

## Prompt Assembly

The orchestration prompt is assembled with the following structure:

```
# ORCHESTRATION INSTRUCTIONS

Current phase: {phase}
Task ID: {task_id}

{FILE_TOOLS_WARNING}

{FILE_LOCATIONS}

{GIT_API_INSTRUCTIONS}  // Only for coding phase

{ARTIFACT_INSTRUCTIONS}  // Only for artifact-producing phases

{SIGNAL_COMPLETE_INSTRUCTIONS}

{PHASE_INSTRUCTIONS[phase]}

Valid completion tokens for this phase: {tokens}

IMPORTANT: Use mark2_signal_complete with one of the valid tokens when done.
Do not signal completion until you have fully completed your work for this phase.
```

The task prompt is separate:

```
# TASK

Task ID: {id}
Title: {title}

## Description
{description}

## Design Document  // Included for phases after design
{design_document}

## Loop Information  // Included if loop_count > 0
This is loop iteration #{loop_count}. Previous attempts did not fully resolve all issues.
Please carefully review the artifacts and feedback to ensure all issues are addressed this time.
```

---

## Customization

### context.json

You can add a custom system prompt by creating `.mark2/context.json`:

```json
{
  "system_prompt": "You are working on a TypeScript/React project. Always use functional components..."
}
```

This is prepended to the orchestration prompt.

### Role Prompts

Role-specific prompts are defined in `.mark2/roles.yaml` and passed via the `--agents` flag. See [MARK2_DIRECTORY.md](./MARK2_DIRECTORY.md#rolesyaml) for the schema.

Example role prompt:
```yaml
roles:
  - name: expert-fullstack-coder
    role_prompt: |-
      You are an expert full-stack developer with deep knowledge of TypeScript, React, Node.js, and modern web development practices.

      Your responsibilities:
      - Implement features according to design specifications
      - Write clean, maintainable, and well-documented code
      - Follow established coding patterns and project conventions
      - Handle edge cases and error conditions gracefully
      - Write meaningful commit messages
      - Ensure code is type-safe and follows TypeScript best practices

      Focus on correctness, readability, and maintainability. Prefer simple solutions over clever ones.
```
