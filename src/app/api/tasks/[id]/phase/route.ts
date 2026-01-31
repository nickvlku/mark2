import { NextResponse } from 'next/server';
import path from 'path';
import { TaskService } from '@/lib/services/task-service';
import { ArtifactService } from '@/lib/services/artifact-service';
import { ActivityService } from '@/lib/services/activity-service';
import { OrchestrationEngine } from '@/lib/orchestration/engine';
import type { Phase } from '@/lib/yaml/schemas';
import type { PhaseContext } from '@/types';

const taskService = new TaskService();
const artifactService = new ArtifactService();
const activityService = new ActivityService();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const task = taskService.getById(id);
    if (!task) {
      return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
    }

    // Build phase context
    const artifacts = artifactService.getForTask(id);
    const previousArtifacts = artifacts.filter((a) => a.phase !== task.phase);

    const context: PhaseContext = {
      task,
      phase: task.phase,
      previous_artifacts: previousArtifacts,
    };

    // Add phase-specific context
    const designArtifact = artifacts.find(
      (a) => a.phase === 'design' && a.name === 'design-document',
    );
    if (designArtifact) {
      const { content, exists } = artifactService.getContent(designArtifact.path);
      if (exists) {
        context.design_document = content;
      }
    }

    // Add recent activity as context for review comments / test failures
    const recentActivity = activityService.getForTask(id, 20);
    const reviewComments = recentActivity
      .filter((e) => e.type === 'comment' && e.source === 'code_review')
      .map((e) => e.message);
    if (reviewComments.length > 0) {
      context.review_comments = reviewComments.join('\n---\n');
    }

    const testFailures = recentActivity
      .filter((e) => e.type === 'error' && e.source === 'testing')
      .map((e) => e.message);
    if (testFailures.length > 0) {
      context.test_failures = testFailures.join('\n---\n');
    }

    const humanComments = recentActivity
      .filter((e) => e.type === 'comment' && e.source === 'human')
      .map((e) => e.message);
    if (humanComments.length > 0) {
      context.human_comments = humanComments.join('\n---\n');
    }

    return NextResponse.json({ context });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to get phase context' },
      { status: 500 },
    );
  }
}

async function handlePhaseTransition(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body.phase) {
      return NextResponse.json(
        { error: 'phase is required' },
        { status: 400 },
      );
    }

    const task = taskService.transitionPhase(id, body.phase);

    // Fire-and-forget: kick off orchestration for the new phase
    const newPhase = body.phase as Phase;
    if (newPhase !== 'pending' && newPhase !== 'done') {
      try {
        const projectRoot = process.cwd();
        const mark2Dir = path.join(projectRoot, '.mark2');
        const engine = OrchestrationEngine.getInstance({
          projectRoot,
          mark2Dir,
          apiBaseUrl: `http://localhost:${process.env.PORT || 3100}`,
          agentToken: process.env.MARK2_AGENT_TOKEN || 'mark2-local',
        });
        // Don't await — let orchestration run in background
        engine.startPhase(id, newPhase).catch((err) => {
          console.error(`[orchestration] Failed to start phase ${newPhase} for ${id}:`, err.message);
        });
      } catch (err: any) {
        // Orchestration failure shouldn't break the phase transition
        console.error(`[orchestration] Engine init failed:`, err.message);
      }
    }

    return NextResponse.json({ task });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error.name === 'ZodError' || error.issues) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues ?? error.message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error.message ?? 'Failed to transition phase' },
      { status: 500 },
    );
  }
}

export const POST = handlePhaseTransition;
export const PUT = handlePhaseTransition;
