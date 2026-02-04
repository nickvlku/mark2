import type { Phase } from '../yaml/schemas';

// ── Phase Order ─────────────────────────────────────────────────────────────

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

// ── End Tokens ──────────────────────────────────────────────────────────────

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

// ── Transition Types ────────────────────────────────────────────────────────

export interface PhaseTransition {
  from: Phase;
  to: Phase;
  trigger: string;
  guard?: (context: Record<string, unknown>) => boolean;
  action?: (context: Record<string, unknown>) => void | Promise<void>;
}

// ── State Machine Transitions ───────────────────────────────────────────────

export const TRANSITIONS: PhaseTransition[] = [
  // pending -> design: blockers resolved or manual kick
  {
    from: 'pending',
    to: 'design',
    trigger: 'blockers_resolved',
    guard: (ctx) => {
      const blockers = ctx['blockers'] as string[] | undefined;
      return !blockers || blockers.length === 0;
    },
  },

  // design -> coding: design completed
  {
    from: 'design',
    to: 'coding',
    trigger: '[DESIGN_COMPLETED]',
  },

  // coding -> testing: coding completed
  {
    from: 'coding',
    to: 'testing',
    trigger: '[CODING_COMPLETED]',
  },

  // testing -> code_review: tests passed
  {
    from: 'testing',
    to: 'code_review',
    trigger: '[TESTING_PASSED]',
  },

  // testing -> coding: tests failed (loop back)
  {
    from: 'testing',
    to: 'coding',
    trigger: '[TESTING_FAILED]',
  },

  // code_review -> final_testing: review completed (no issues)
  {
    from: 'code_review',
    to: 'final_testing',
    trigger: '[REVIEW_COMPLETED]',
  },

  // code_review -> fix_review: review found issues that need fixes
  {
    from: 'code_review',
    to: 'fix_review',
    trigger: '[REVIEW_NEEDS_FIXES]',
  },

  // code_review -> coding: review found auto-fixable issues (loop back)
  {
    from: 'code_review',
    to: 'coding',
    trigger: '[REVIEW_COMPLETED]:autofix',
  },

  // fix_review -> final_testing: fixes reviewed and approved
  {
    from: 'fix_review',
    to: 'final_testing',
    trigger: '[FIX_REVIEW_COMPLETED]',
  },

  // final_testing -> run_test_plan: final tests passed
  {
    from: 'final_testing',
    to: 'run_test_plan',
    trigger: '[FINAL_TESTING_PASSED]',
  },

  // final_testing -> fix_review: final tests failed (loop back for fixes)
  {
    from: 'final_testing',
    to: 'fix_review',
    trigger: '[FINAL_TESTING_FAILED]',
  },

  // run_test_plan -> done: test plan passed
  {
    from: 'run_test_plan',
    to: 'done',
    trigger: '[RUN_TEST_PLAN_PASSED]',
  },

  // run_test_plan -> fix_review: test plan failed (loop back for fixes)
  {
    from: 'run_test_plan',
    to: 'fix_review',
    trigger: '[RUN_TEST_PLAN_FAILED]',
  },

  // done: terminal state, task completed
  {
    from: 'done',
    to: 'done',
    trigger: '[TASK_COMPLETED]',
  },
];

// ── Query Helpers ───────────────────────────────────────────────────────────

/**
 * Returns the list of valid next phases from the given current phase.
 */
export function getValidTransitions(currentPhase: Phase): Phase[] {
  const nextPhases = TRANSITIONS
    .filter((t) => t.from === currentPhase)
    .map((t) => t.to);

  // Deduplicate
  return [...new Set(nextPhases)];
}

/**
 * Returns true if a direct transition from `from` to `to` is defined.
 */
export function isValidTransition(from: Phase, to: Phase): boolean {
  return TRANSITIONS.some((t) => t.from === from && t.to === to);
}

/**
 * Finds the transition matching a specific trigger from the current phase.
 */
export function findTransitionByTrigger(
  currentPhase: Phase,
  trigger: string,
): PhaseTransition | undefined {
  return TRANSITIONS.find((t) => t.from === currentPhase && t.trigger === trigger);
}

/**
 * Returns the index of a phase in the pipeline order.
 */
export function phaseIndex(phase: Phase): number {
  return PHASE_ORDER.indexOf(phase);
}
