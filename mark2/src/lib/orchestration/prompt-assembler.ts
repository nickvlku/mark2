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

const PHASE_INSTRUCTIONS: Record<Phase, string> = {
  pending: '',

  design: `You are in the DESIGN phase. Your job is to:
1. Analyze the task requirements thoroughly
2. Produce a design document covering architecture, data models, API contracts, and file changes
3. Identify risks and edge cases
4. Save your design document as design.md in the worktree root

When you have completed the design, emit the end token: [DESIGN_COMPLETED]`,

  coding: `You are in the CODING phase. Your job is to:
1. Implement the changes described in the design document
2. Follow the project's coding conventions and style
3. Write clean, well-documented code
4. Ensure the code compiles/builds without errors
5. Commit your changes with clear commit messages

When you have completed the implementation, emit the end token: [CODING_COMPLETED]`,

  testing: `You are in the TESTING phase. Your job is to:
1. Run the existing test suite and verify it passes
2. Write new tests covering the changes made in the coding phase
3. Ensure adequate test coverage for edge cases
4. Run all tests and report results

If all tests pass, emit: [TESTING_PASSED]
If any tests fail, emit: [TESTING_FAILED]`,

  code_review: `You are in the CODE REVIEW phase. Your job is to:
1. Review all changes made since the branch diverged from main
2. Check for correctness, security issues, performance problems, and style violations
3. Classify each issue by severity: P0 (must fix), P1 (should fix), P2 (nice to fix)
4. Provide specific, actionable feedback with file paths and line numbers
5. Save your review as review.md in the worktree root

When you have completed the review, emit: [REVIEW_COMPLETED]`,

  manual_testing: `You are in the MANUAL TESTING phase. Your job is to:
1. Start any development servers needed to test the changes
2. Generate a test plan with specific steps a human tester should follow
3. Save the test plan as test-plan.md in the worktree root
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

    if (!task.auto_advance) {
      // If auto_advance is disabled, modify the instructions to not emit end tokens
      orchestrationInstructions = [
        `Current phase: ${phase}`,
        '',
        instructions,
        '',
        'IMPORTANT: Auto-advance is DISABLED for this task.',
        'Do NOT emit end tokens as they will be ignored.',
        'Focus on completing your work thoroughly without triggering phase transitions.',
      ];
    } else {
      // Standard instructions with end tokens
      orchestrationInstructions = [
        `Current phase: ${phase}`,
        '',
        instructions,
        '',
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
