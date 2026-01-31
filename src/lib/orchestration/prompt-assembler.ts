import fs from 'fs';
import path from 'path';
import type { Task, AgentDefinition, Phase } from '../yaml/schemas';
import { END_TOKENS } from './pipeline';
import { getTaskStoragePathsFromMark2Dir } from '../utils/storage';

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
configured for a different project and will write files to the WRONG location.`;

const FILE_LOCATIONS = `
## File Locations

**Artifacts**: Save design documents, test results, review notes, and other deliverables to the artifacts directory.
  - Use \`mark2_get_paths\` to get the exact path, or use \`mark2_save_artifact\` to save and register in one step.

**Working Directory**: Make all code changes in the current working directory (an isolated git clone).
  - This is where source code, package.json, and other project files live.
  - Use Mark2 MCP tools for git operations (see Git Operations below).

**Important**: Do NOT create \`.mark2/\` folders in the working directory. Do NOT write test outputs,
artifacts, or temporary files to the working directory. Only source code changes belong there.`;

const GIT_API_INSTRUCTIONS = `
## Git Operations (CRITICAL)

You MUST use the Mark2 MCP tools for all git operations. DO NOT run git commands directly.
These tools handle commit, push, and sync operations safely within your isolated clone.

**Check git status:**
  Use \`mark2_git_status\` with task_id to see modified files and current branch.

**Commit changes:**
  Use \`mark2_git_commit\` with task_id and message to stage and commit all changes.

**Push to remote:**
  Use \`mark2_git_push\` with task_id to push your branch.

**Sync with latest from main:**
  Use \`mark2_git_sync\` with task_id to rebase on the latest main branch.

IMPORTANT: Always commit your changes before signaling phase completion. Push is optional but recommended.`;

const ARTIFACT_INSTRUCTIONS = `
## Saving Artifacts

Use the \`mark2_save_artifact\` MCP tool to save artifacts. Just provide the filename you want — it will be stored with a unique name like "{phase}-{filename}-{timestamp}-{random}.{ext}".

Examples:
  mark2_save_artifact(task_id: "<ID>", filename: "design.md", content: "# Design...")
  mark2_save_artifact(task_id: "<ID>", filename: "screenshot.png", content: "<base64>")
  mark2_save_artifact(task_id: "<ID>", filename: "results.json", content: "{...}")

You can save multiple artifacts per phase. Each gets a unique filename.
Always save artifacts BEFORE signaling phase completion.`;

const SIGNAL_COMPLETE_INSTRUCTIONS = `
## Signaling Phase Completion

When you have completed all work for this phase, use the \`mark2_signal_complete\` MCP tool.
Use the Task ID shown at the top of this prompt.

  mark2_signal_complete(task_id: "<YOUR_TASK_ID>", token: "<END_TOKEN>")

This triggers the phase transition automatically. Do NOT emit end tokens as plain text.`;

const PHASE_INSTRUCTIONS: Record<Phase, string> = {
  pending: '',

  design: `You are in the DESIGN phase. Your job is to:
1. Analyze the task requirements thoroughly
2. Produce a design document covering architecture, data models, API contracts, and file changes
3. Identify risks and edge cases
4. Save your design: mark2_save_artifact(task_id, filename: "design.md", content: "...")

When done, signal: mark2_signal_complete(task_id, token: "[DESIGN_COMPLETED]")`,

  coding: `You are in the CODING phase. Your job is to:
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

When done, signal: mark2_signal_complete(task_id, token: "[CODING_COMPLETED]")`,

  testing: `You are in the TESTING phase. Your job is to:
1. Run the existing test suite and verify it passes
2. Write new tests covering the changes made in the coding phase
3. Ensure adequate test coverage for edge cases
4. Run all tests and save results: mark2_save_artifact(task_id, filename: "test-results.md", content: "...")

If all tests pass: mark2_signal_complete(task_id, token: "[TESTING_PASSED]")
If any tests fail: mark2_signal_complete(task_id, token: "[TESTING_FAILED]")`,

  code_review: `You are in the CODE REVIEW phase. Your job is to:
1. Get the diff: run \`git diff $(git merge-base origin/HEAD HEAD)\` to see all changes
2. Get context: use mark2_get_latest_artifact(task_id, "design") to read the design document
3. Review all changes for correctness, security issues, performance problems, and style violations
4. Classify issues by severity: P0 (must fix), P1 (should fix), P2 (nice to fix)
5. Save your review: mark2_save_artifact(task_id, filename: "review.md", content: "...")

If no fixes needed: mark2_signal_complete(task_id, token: "[REVIEW_COMPLETED]")
If fixes are required: mark2_signal_complete(task_id, token: "[REVIEW_NEEDS_FIXES]")`,

  fix_review: `You are in the FIX REVIEW phase. Your job is to:
1. Get the MOST RECENT review feedback: use mark2_get_latest_artifact(task_id, "review") - this automatically returns only the latest review, ignoring older ones that were already addressed
2. If tests failed, also get test results: mark2_get_latest_artifact(task_id, "test")
3. Address all P0 and P1 issues from the review
4. Make the necessary code changes
5. Commit your fixes: mark2_git_commit(task_id, message: "fix: address code review feedback")

When done, signal: mark2_signal_complete(task_id, token: "[FIX_REVIEW_COMPLETED]")`,

  final_testing: `You are in the FINAL TESTING phase. Your job is to:
1. Run the complete test suite after code review approval
2. Verify that all tests still pass after any review-related changes
3. Save results: mark2_save_artifact(task_id, filename: "final-test-results.md", content: "...")

If all tests pass: mark2_signal_complete(task_id, token: "[FINAL_TESTING_PASSED]")
If any tests fail: mark2_signal_complete(task_id, token: "[FINAL_TESTING_FAILED]")`,

  manual_testing: `You are in the MANUAL TESTING phase. Your job is to:
1. Start any development servers needed to test the changes
2. Generate a test plan with specific steps a human tester should follow
3. Save the test plan: mark2_save_artifact(task_id, filename: "test-plan.md", content: "...")
4. Report which ports are in use

When ready, signal: mark2_signal_complete(task_id, token: "[MANUAL_TESTING_READY]")`,

  done: `The task is complete. Signal: mark2_signal_complete(task_id, token: "[TASK_COMPLETED]")`,
};

// ── Prompt Assembler ────────────────────────────────────────────────────────

export interface AgentPromptParts {
  /** Orchestration instructions for --append-system-prompt flag */
  orchestrationPrompt: string;
  /** Agent personality/role for --agents flag */
  agentPrompt: string;
  /** Task prompt (the actual work to do) - first CLI argument */
  taskPrompt: string;
  /** Agent name/slug for --agent flag */
  agentName: string;
}

export class PromptAssembler {
  private mark2Dir: string;

  constructor(mark2Dir: string) {
    this.mark2Dir = mark2Dir;
  }

  /**
   * Build separate prompts for Claude's CLI flags:
   *
   * - orchestrationPrompt (for --append-system-prompt): Phase instructions, MCP tools, etc.
   * - agentPrompt (for --agents): Agent's role/personality only
   * - taskPrompt (first argument): Just the task description and context
   */
  buildAgentAndTaskPrompts(
    task: Task,
    agent: AgentDefinition,
    phase: Phase,
    context?: PromptContext,
  ): AgentPromptParts {
    const storagePaths = getTaskStoragePathsFromMark2Dir(this.mark2Dir, task.id);

    // Build orchestration prompt (phase-specific instructions for --append-system-prompt)
    const orchestrationParts: string[] = [];

    // System context from context.json
    const systemPrompt = this.getSystemPrompt();
    if (systemPrompt) {
      orchestrationParts.push(systemPrompt);
    }

    // Phase-specific orchestration
    orchestrationParts.push(this.buildOrchestrationLayer(task, phase));

    let orchestrationPrompt = orchestrationParts.join('\n\n');
    orchestrationPrompt = orchestrationPrompt.replace(/\$MARK2_ARTIFACTS_DIR/g, storagePaths.artifacts);
    orchestrationPrompt = orchestrationPrompt.replace(/\$MARK2_PROMPTS_DIR/g, storagePaths.prompts);
    orchestrationPrompt = orchestrationPrompt.replace(/\$MARK2_STORAGE_DIR/g, storagePaths.root);

    // Build agent prompt (role/personality only for --agents)
    let agentPrompt = agent.role_prompt;
    agentPrompt = agentPrompt.replace(/\$MARK2_ARTIFACTS_DIR/g, storagePaths.artifacts);
    agentPrompt = agentPrompt.replace(/\$MARK2_PROMPTS_DIR/g, storagePaths.prompts);
    agentPrompt = agentPrompt.replace(/\$MARK2_STORAGE_DIR/g, storagePaths.root);

    // Build the task prompt (just the task - first CLI argument)
    let taskPrompt = this.buildTaskLayer(task, phase, context);
    taskPrompt = taskPrompt.replace(/\$MARK2_ARTIFACTS_DIR/g, storagePaths.artifacts);
    taskPrompt = taskPrompt.replace(/\$MARK2_PROMPTS_DIR/g, storagePaths.prompts);
    taskPrompt = taskPrompt.replace(/\$MARK2_STORAGE_DIR/g, storagePaths.root);

    // Agent name for --agent flag (sanitized)
    const agentName = `mark2-${phase}`;

    return { orchestrationPrompt, agentPrompt, taskPrompt, agentName };
  }

  /**
   * Legacy: Assemble the full prompt (for adapters that don't support separate flags).
   * Combines all parts into a single prompt string.
   */
  assemble(task: Task, agent: AgentDefinition, phase: Phase, context?: PromptContext): string {
    const parts = this.buildAgentAndTaskPrompts(task, agent, phase, context);
    return `${parts.agentPrompt}\n\n---\n\n${parts.orchestrationPrompt}\n\n---\n\n${parts.taskPrompt}`;
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
      ? `Valid completion tokens for this phase: ${tokens.join(', ')}`
      : 'No completion tokens for this phase.';

    let orchestrationInstructions: string[];

    // Only include artifact instructions for phases that produce artifacts
    const artifactPhases: Phase[] = ['design', 'coding', 'testing', 'code_review', 'manual_testing'];
    const includeArtifacts = artifactPhases.includes(phase);

    // Include git instructions for coding phase
    const includeGit = phase === 'coding';

    if (!task.auto_advance) {
      // If auto_advance is disabled, don't signal completion
      orchestrationInstructions = [
        `Current phase: ${phase}`,
        `Task ID: ${task.id}`,
        '',
        FILE_TOOLS_WARNING,
        '',
        FILE_LOCATIONS,
        '',
        ...(includeGit ? [GIT_API_INSTRUCTIONS, ''] : []),
        ...(includeArtifacts ? [ARTIFACT_INSTRUCTIONS, ''] : []),
        instructions,
        '',
        'IMPORTANT: Auto-advance is DISABLED for this task.',
        'Do NOT use mark2_signal_complete. Focus on completing your work without triggering phase transitions.',
      ];
    } else {
      // Standard instructions with MCP signal completion
      orchestrationInstructions = [
        `Current phase: ${phase}`,
        `Task ID: ${task.id}`,
        '',
        FILE_TOOLS_WARNING,
        '',
        FILE_LOCATIONS,
        '',
        ...(includeGit ? [GIT_API_INSTRUCTIONS, ''] : []),
        ...(includeArtifacts ? [ARTIFACT_INSTRUCTIONS, ''] : []),
        SIGNAL_COMPLETE_INSTRUCTIONS,
        '',
        instructions,
        '',
        tokenList,
        '',
        'IMPORTANT: Use mark2_signal_complete with one of the valid tokens when done.',
        'Do not signal completion until you have fully completed your work for this phase.',
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

    // Note: For code_review and fix_review phases, the agent fetches large artifacts
    // (diff, review comments, test failures) via MCP tools to avoid shell escaping issues

    // Include loop count info (small, safe to include inline)
    if (context?.loopCount && context.loopCount > 0) {
      parts.push(
        '',
        `## Loop Information`,
        `This is loop iteration #${context.loopCount}. Previous attempts did not fully resolve all issues.`,
        'Please carefully review the artifacts and feedback to ensure all issues are addressed this time.',
      );
    }

    return this.section('TASK', parts.join('\n'));
  }

  private section(title: string, content: string): string {
    return `# ${title}\n\n${content}`;
  }
}
