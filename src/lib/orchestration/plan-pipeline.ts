import type { PlanPhase } from '../yaml/schemas';

// ── Plan Phase Order ────────────────────────────────────────────────────────

export const PLAN_PHASE_ORDER: PlanPhase[] = [
  'prompt',
  'prd',
  'prd_review',
  'tech_spec',
  'tech_spec_review',
  'task_generation',
  'task_review',
  'done',
];

// ── Plan End Tokens ─────────────────────────────────────────────────────────

export const PLAN_END_TOKENS: Partial<Record<PlanPhase, string[]>> = {
  prd: ['[PRD_COMPLETED]'],
  tech_spec: ['[TECH_SPEC_COMPLETED]'],
  task_generation: ['[TASKS_GENERATED]'],
};

// ── Plan Transitions ────────────────────────────────────────────────────────

export interface PlanTransition {
  from: PlanPhase;
  to: PlanPhase;
  trigger: string;
}

export const PLAN_TRANSITIONS: PlanTransition[] = [
  { from: 'prompt', to: 'prd', trigger: 'start' },
  { from: 'prd', to: 'prd_review', trigger: '[PRD_COMPLETED]' },
  { from: 'prd_review', to: 'prd', trigger: 'revise' },
  { from: 'prd_review', to: 'tech_spec', trigger: 'approve' },
  { from: 'tech_spec', to: 'tech_spec_review', trigger: '[TECH_SPEC_COMPLETED]' },
  { from: 'tech_spec_review', to: 'tech_spec', trigger: 'revise' },
  { from: 'tech_spec_review', to: 'task_generation', trigger: 'approve' },
  { from: 'task_generation', to: 'task_review', trigger: '[TASKS_GENERATED]' },
  { from: 'task_review', to: 'task_generation', trigger: 'revise' },
  { from: 'task_review', to: 'done', trigger: 'confirm' },
];

// ── Agent Phases (phases where an agent runs) ───────────────────────────────

export const PLAN_AGENT_PHASES: PlanPhase[] = ['prd', 'tech_spec', 'task_generation'];

// ── Review Phases (phases where user reviews artifacts) ─────────────────────

export const PLAN_REVIEW_PHASES: PlanPhase[] = ['prd_review', 'tech_spec_review', 'task_review'];

// ── Query Helpers ───────────────────────────────────────────────────────────

export function findPlanTransition(
  from: PlanPhase,
  trigger: string,
): PlanTransition | undefined {
  return PLAN_TRANSITIONS.find((t) => t.from === from && t.trigger === trigger);
}

export function getPlanPhaseIndex(phase: PlanPhase): number {
  return PLAN_PHASE_ORDER.indexOf(phase);
}

/** Map plan agent phases to their role names */
export const PLAN_PHASE_ROLES: Record<string, string> = {
  prd: 'prd-writer',
  tech_spec: 'tech-spec-writer',
  task_generation: 'story-planner',
};
