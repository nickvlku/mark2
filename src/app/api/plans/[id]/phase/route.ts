import { NextResponse } from 'next/server';
import { createPlanService } from '@/lib/services/factory';
import { isValidPlanId } from '@/lib/utils/route-validation';
import { getMark2Dir, getProjectRoot } from '@/lib/utils/mark2-dir';
import { PlanEngine } from '@/lib/orchestration/plan-engine';
import { PLAN_AGENT_PHASES } from '@/lib/orchestration/plan-pipeline';
import type { PlanPhase } from '@/lib/yaml/schemas';

const service = createPlanService();

// Phase transition map for user actions
const APPROVE_TRANSITIONS: Record<string, PlanPhase> = {
  'prd_review': 'tech_spec',
  'tech_spec_review': 'task_generation',
};

const REVISE_TRANSITIONS: Record<string, PlanPhase> = {
  'prd_review': 'prd',
  'tech_spec_review': 'tech_spec',
  'task_review': 'task_generation',
};

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidPlanId(id)) {
      return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
    }

    const body = await request.json();
    const { action, feedback } = body;

    if (!action || !['approve', 'revise', 'start'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "approve", "revise", or "start"' },
        { status: 400 },
      );
    }

    const plan = service.getById(id);
    if (!plan) {
      return NextResponse.json({ error: `Plan ${id} not found` }, { status: 404 });
    }

    let nextPhase: PlanPhase | undefined;

    if (action === 'start') {
      if (plan.phase !== 'prompt') {
        return NextResponse.json(
          { error: `Cannot start from phase "${plan.phase}" — plan must be in "prompt" phase` },
          { status: 400 },
        );
      }
      nextPhase = 'prd';
    } else if (action === 'approve') {
      nextPhase = APPROVE_TRANSITIONS[plan.phase];
      if (!nextPhase) {
        return NextResponse.json(
          { error: `Cannot approve from phase "${plan.phase}"` },
          { status: 400 },
        );
      }
    } else {
      nextPhase = REVISE_TRANSITIONS[plan.phase];
      if (!nextPhase) {
        return NextResponse.json(
          { error: `Cannot revise from phase "${plan.phase}"` },
          { status: 400 },
        );
      }
    }

    // For agent phases, start the agent before committing the transition.
    // If startup fails, don't transition — the plan stays in its current phase so the user can retry.
    if (PLAN_AGENT_PHASES.includes(nextPhase)) {
      const mark2Dir = getMark2Dir();
      const projectRoot = getProjectRoot();
      const engine = new PlanEngine({
        projectRoot,
        mark2Dir,
        apiBaseUrl: `http://localhost:${process.env.PORT || 3100}`,
        agentToken: process.env.MARK2_AGENT_TOKEN || 'mark2-local',
      });

      try {
        await engine.startPhase(id, nextPhase, feedback);
      } catch (err: any) {
        console.error(`[plan-engine] Failed to start phase ${nextPhase} for ${id}:`, err.message);
        return NextResponse.json(
          { error: `Failed to start agent: ${err.message}` },
          { status: 500 },
        );
      }
    }

    const updated = await service.transitionPhase(id, nextPhase);

    return NextResponse.json({
      plan: updated,
      action,
      previous_phase: plan.phase,
      new_phase: nextPhase,
      feedback: feedback || null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to transition phase' },
      { status: 500 },
    );
  }
}
