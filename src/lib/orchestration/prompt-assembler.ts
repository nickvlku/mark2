import fs from 'fs';
import path from 'path';
import type { Task, AgentDefinition, Phase } from '../yaml/schemas';
import { END_TOKENS } from './pipeline';

// ── Types ───────────────────────────────────────────────────────────────────

export interface PromptContext {
  designDocument?: string;
  reviewComments?: string;
  testFailures?: string;
  humanComments?: string;
  diff?: string;
  loopCount?: number;
}

interface ContextJson {
  system_prompt?: string;
  project_name?: string;
  tech_stack?: string[];
  conventions?: string[];
}

// ── Phase-Specific Instructions ─────────────────────────────────────────────

const FILE_TOOLS_WARNING = `
## CRITICAL: File Operations

You are running in an isolated git clone for this task. You MUST use Claude Code's native file tools
(Read, Write, Edit, Glob, Grep) for ALL file operations.

DO NOT use Serena/MCP file tools (plugin:serena) as they may be configured for a different project
and will write files to the WRONG location.

Use these tools:
- Read: to read files
- Write: to create new files
- Edit: to modify existing files
- Glob: to find files by pattern
- Grep: to search file contents
- Bash: for npm, running tests, dev server, etc.

If you see Serena tools available, IGNORE them and use Claude Code's native tools instead.`;

const FILE_LOCATIONS = `
## File Locations

**Artifacts**: Save design documents, test results, review notes, and other deliverables to: \`$MARK2_ARTIFACTS_DIR/\`
  - Example: Save your design document as \`$MARK2_ARTIFACTS_DIR/design.md\`
  - Example: Save test results as \`$MARK2_ARTIFACTS_DIR/test-results.md\`
  - Example: Save review notes as \`$MARK2_ARTIFACTS_DIR/review.md\`

**Working Directory**: Make all code changes in the current working directory (an isolated git clone).
  - This is where source code, package.json, and other project files live.
  - Use the Git API to commit and push your changes (see Git Operations below).

**Important**: Do NOT create \`.mark2/\` folders in the working directory. Do NOT write test outputs,
artifacts, or temporary files to the working directory. Only source code changes belong there.`;

const GIT_API_INSTRUCTIONS = `
## Git Operations (CRITICAL)

You MUST use the Mark2 Git API for all git operations. DO NOT run git commands directly.
The API handles commit, push, and sync operations safely within your isolated clone.

**Check git status:**
  curl -s "$MARK2_API_URL/api/tasks/$MARK2_TASK_ID/git"

**Commit changes:**
  curl -s -X POST "$MARK2_API_URL/api/tasks/$MARK2_TASK_ID/git/commit" \\
    -H "Content-Type: application/json" \\
    -d '{"message": "Your commit message here"}'

**Push to remote:**
  curl -s -X POST "$MARK2_API_URL/api/tasks/$MARK2_TASK_ID/git/push"

**Sync with latest from main (rebase):**
  curl -s -X POST "$MARK2_API_URL/api/tasks/$MARK2_TASK_ID/git/sync"

IMPORTANT: Always commit your changes before emitting an end token. Push is optional but recommended.`;

const ARTIFACT_INSTRUCTIONS = `
## Reporting Artifacts

After creating any document or file that is a deliverable of this phase, you MUST register it
as an artifact so the human operator can review it. Use curl with the environment variables
that are already set in your shell:

  curl -s -X POST "$MARK2_API_URL/api/tasks/$MARK2_TASK_ID/artifacts" \\
    -H "Content-Type: application/json" \\
    -d '{"name": "<artifact-name>", "phase": "<current-phase>", "path": "<artifact-filename>"}'

For example, after creating design.md in $MARK2_ARTIFACTS_DIR:

  curl -s -X POST "$MARK2_API_URL/api/tasks/$MARK2_TASK_ID/artifacts" \\
    -H "Content-Type: application/json" \\
    -d '{"name": "design-document", "phase": "design", "path": "design.md"}'

Note: The path should be the filename only (e.g., "design.md"), not the full path.
The system will resolve it from the artifacts directory.

Always register artifacts BEFORE emitting the end token.`;

const PHASE_INSTRUCTIONS: Record<Phase, string> = {
  pending: '',

  design: `You are in the DESIGN phase. Your job is to:
1. Analyze the task requirements thoroughly
2. Produce a design document covering architecture, data models, API contracts, and file changes
3. Identify risks and edge cases
4. Save your design document as $MARK2_ARTIFACTS_DIR/design.md
5. Register design.md as an artifact (see artifact instructions below)

When you have completed the design and registered artifacts, emit the end token: [DESIGN_COMPLETED]`,

  coding: `You are in the CODING phase. Your job is to:
1. Implement the changes described in the design document
2. Follow the project's coding conventions and style
3. Write clean, well-documented code
4. Ensure the code compiles/builds without errors
5. Commit your changes using the Git API (see Git Operations section)

When you have completed the implementation and committed your changes, emit the end token: [CODING_COMPLETED]`,

  testing: `You are in the TESTING phase. Your job is to:
1. Run the existing test suite and verify it passes
2. Write new tests covering the changes made in the coding phase
3. Ensure adequate test coverage for edge cases
4. Run all tests and report results
5. Save a test report as $MARK2_ARTIFACTS_DIR/test-results.md and register it as an artifact

If all tests pass, emit: [TESTING_PASSED]
If any tests fail, emit: [TESTING_FAILED]`,

  code_review: `You are in the CODE REVIEW phase. Your job is to:
1. Review all changes made since the branch diverged from main
2. Check for correctness, security issues, performance problems, and style violations
3. Classify each issue by severity: P0 (must fix), P1 (should fix), P2 (nice to fix)
4. Provide specific, actionable feedback with file paths and line numbers
5. Save your review as $MARK2_ARTIFACTS_DIR/review.md and register it as an artifact

When you have completed the review, emit: [REVIEW_COMPLETED]`,

  manual_testing: `You are in the MANUAL TESTING phase. Your job is to:
1. Start any development servers needed to test the changes
2. Generate a test plan with specific steps a human tester should follow
3. Save the test plan as $MARK2_ARTIFACTS_DIR/test-plan.md and register it as an artifact
4. Report which ports are in use

When the test environment is ready, emit: [MANUAL_TESTING_READY]`,

  done: `The task is complete. Emit: [TASK_COMPLETED]`,
};

// ── Prompt Assembler ────────────────────────────────────────────────────────

export class PromptAssembler {
  private mark2Dir: string;

  constructor(mark2Dir: string) {
    this.mark2Dir = mark2Dir;
  }

  /**
   * Assemble the 4-layer prompt for an agent invocation.
   *
   * Layer 1: System prompt (from .mark2/context.json)
   * Layer 2: Orchestration prompt (phase instructions, end tokens, tool info)
   * Layer 3: Role prompt (from agent definition)
   * Layer 4: Task prompt (description + context)
   */
  assemble(task: Task, agent: AgentDefinition, phase: Phase, context?: PromptContext): string {
    const layers: string[] = [];

    // Layer 1: System prompt
    const systemPrompt = this.getSystemPrompt();
    if (systemPrompt) {
      layers.push(this.section('SYSTEM CONTEXT', systemPrompt));
    }

    // Layer 2: Orchestration prompt
    layers.push(this.buildOrchestrationLayer(task, phase));

    // Layer 3: Role prompt
    layers.push(this.section('YOUR ROLE', agent.role_prompt));

    // Layer 4: Task prompt
    layers.push(this.buildTaskLayer(task, phase, context));

    return layers.join('\n\n---\n\n');
  }

  // ── Private Helpers ─────────────────────────────────────────────────────

  private getSystemPrompt(): string | null {
    const contextPath = path.join(this.mark2Dir, 'context.json');
    try {
      if (!fs.existsSync(contextPath)) return null;
      const raw = fs.readFileSync(contextPath, 'utf-8');
      const data: ContextJson = JSON.parse(raw);
      return data.system_prompt ?? null;
    } catch {
      return null;
    }
  }

  private buildOrchestrationLayer(task: Task, phase: Phase): string {
    const instructions = PHASE_INSTRUCTIONS[phase];
    const tokens = END_TOKENS[phase];
    const tokenList = tokens.length > 0
      ? `End tokens for this phase: ${tokens.join(', ')}`
      : 'No end tokens for this phase.';

    let orchestrationInstructions: string[];

    // Only include artifact instructions for phases that produce artifacts
    const artifactPhases: Phase[] = ['design', 'testing', 'code_review', 'manual_testing'];
    const includeArtifacts = artifactPhases.includes(phase);

    // Include git API instructions for coding phase
    const includeGitApi = phase === 'coding';

    if (!task.auto_advance) {
      // If auto_advance is disabled, modify the instructions to not emit end tokens
      orchestrationInstructions = [
        `Current phase: ${phase}`,
        '',
        FILE_TOOLS_WARNING,
        '',
        FILE_LOCATIONS,
        '',
        ...(includeGitApi ? [GIT_API_INSTRUCTIONS, ''] : []),
        instructions,
        '',
        ...(includeArtifacts ? [ARTIFACT_INSTRUCTIONS, ''] : []),
        'IMPORTANT: Auto-advance is DISABLED for this task.',
        'Do NOT emit end tokens as they will be ignored.',
        'Focus on completing your work thoroughly without triggering phase transitions.',
      ];
    } else {
      // Standard instructions with end tokens
      orchestrationInstructions = [
        `Current phase: ${phase}`,
        '',
        FILE_TOOLS_WARNING,
        '',
        FILE_LOCATIONS,
        '',
        ...(includeGitApi ? [GIT_API_INSTRUCTIONS, ''] : []),
        instructions,
        '',
        ...(includeArtifacts ? [ARTIFACT_INSTRUCTIONS, ''] : []),
        tokenList,
        '',
        'IMPORTANT: You MUST emit exactly one of the end tokens listed above when you are done.',
        'The end token must appear on its own line in your output.',
        'Do not emit an end token until you have fully completed your work for this phase.',
      ];
    }

    return this.section(
      'ORCHESTRATION INSTRUCTIONS',
      orchestrationInstructions.join('\n'),
    );
  }

  private buildTaskLayer(task: Task, phase: Phase, context?: PromptContext): string {
    const parts: string[] = [
      `Task ID: ${task.id}`,
      `Title: ${task.title}`,
      '',
      '## Description',
      task.description,
    ];

    // Include design document for phases after design
    if (context?.designDocument && phase !== 'design') {
      parts.push('', '## Design Document', context.designDocument);
    }

    // Include diff for code review
    if (context?.diff && phase === 'code_review') {
      parts.push('', '## Code Diff (changes to review)', '```diff', context.diff, '```');
    }

    // Include loop-back context
    if (context?.testFailures) {
      parts.push(
        '',
        '## Previous Test Failures',
        'The following tests failed in the previous testing phase. You must fix these issues:',
        '',
        context.testFailures,
      );
    }

    if (context?.reviewComments) {
      parts.push(
        '',
        '## Code Review Feedback',
        'The following issues were found during code review. You must address these:',
        '',
        context.reviewComments,
      );
    }

    if (context?.humanComments) {
      parts.push(
        '',
        '## Human Tester Comments',
        'A human tester provided the following feedback:',
        '',
        context.humanComments,
      );
    }

    if (context?.loopCount && context.loopCount > 0) {
      parts.push(
        '',
        `## Loop Information`,
        `This is loop iteration #${context.loopCount}. Previous attempts did not fully resolve all issues.`,
        'Please carefully review the feedback above and ensure all issues are addressed this time.',
      );
    }

    return this.section('TASK', parts.join('\n'));
  }

  private section(title: string, content: string): string {
    return `# ${title}\n\n${content}`;
  }
}
