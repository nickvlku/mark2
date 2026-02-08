import { NextResponse } from 'next/server';
import { createPlanService } from '@/lib/services/factory';
import { isValidPlanId } from '@/lib/utils/route-validation';
import { getMark2Dir, getProjectRoot } from '@/lib/utils/mark2-dir';
import { PlanEngine } from '@/lib/orchestration/plan-engine';
import type { PlanPhase } from '@/lib/yaml/schemas';

const service = createPlanService();

// Map end tokens to { expected source phase, target review phase }
const TOKEN_TRANSITIONS: Record<string, { from: PlanPhase; to: PlanPhase }> = {
  '[PRD_COMPLETED]': { from: 'prd', to: 'prd_review' },
  '[TECH_SPEC_COMPLETED]': { from: 'tech_spec', to: 'tech_spec_review' },
  '[TASKS_GENERATED]': { from: 'task_generation', to: 'task_review' },
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidPlanId(id)) {
      return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
    }

    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { error: 'token is required' },
        { status: 400 },
      );
    }

    const plan = service.getById(id);
    if (!plan) {
      return NextResponse.json({ error: `Plan ${id} not found` }, { status: 404 });
    }

    const transition = TOKEN_TRANSITIONS[token];
    if (!transition) {
      return NextResponse.json(
        { error: `Unknown end token: ${token}` },
        { status: 400 },
      );
    }

    // Validate the token matches the plan's current phase
    if (plan.phase !== transition.from) {
      return NextResponse.json(
        { error: `Token "${token}" is not valid for current phase "${plan.phase}" (expected "${transition.from}")` },
        { status: 409 },
      );
    }

    const nextPhase = transition.to;

    console.log(`[plan-hook-complete] Processing token "${token}" for plan ${id} (phase: ${plan.phase})`);

    // Process end token through engine (marks session completed, stops streaming)
    try {
      const mark2Dir = getMark2Dir();
      const projectRoot = getProjectRoot();
      const engine = new PlanEngine({
        projectRoot,
        mark2Dir,
        apiBaseUrl: `http://localhost:${process.env.PORT || 3100}`,
        agentToken: process.env.MARK2_AGENT_TOKEN || 'mark2-local',
      });

      await engine.processEndToken(id, plan.phase, token);
    } catch (err: any) {
      console.error('[plan-hook-complete] Engine processEndToken failed:', err.message);
    }

    const updated = await service.transitionPhase(id, nextPhase);

    return NextResponse.json({
      success: true,
      message: `Token "${token}" processed`,
      plan_id: id,
      previous_phase: plan.phase,
      new_phase: nextPhase,
    });
  } catch (error: any) {
    console.error('[plan-hook-complete] Error:', error);
    return NextResponse.json(
      { error: error.message ?? 'Failed to process hook completion' },
      { status: 500 },
    );
  }
}
