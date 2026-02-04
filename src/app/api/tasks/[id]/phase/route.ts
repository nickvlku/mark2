import { NextResponse } from 'next/server';
import { createTaskService, createArtifactService, createActivityService } from '@/lib/services/factory';
import { getMark2Dir, getProjectRoot } from '@/lib/utils/mark2-dir';
import { OrchestrationEngine } from '@/lib/orchestration/engine';
import { handleDone } from '@/lib/orchestration/phase-handlers/done';
import type { Phase } from '@/lib/yaml/schemas';
import type { PhaseContext } from '@/types';
import { isValidTaskId } from '@/lib/utils/route-validation';

const taskService = createTaskService();
const artifactService = createArtifactService();
const activityService = createActivityService();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidTaskId(id)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }
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
    if (!isValidTaskId(id)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }
    const body = await request.json();

    if (!body.phase) {
      return NextResponse.json(
        { error: 'phase is required' },
        { status: 400 },
      );
    }

    // Get the task first to check current phase
    const existingTask = taskService.getById(id);
    if (!existingTask) {
      return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
    }
    const previousPhase = existingTask.phase;

    // Transition phase (handles lock acquisition/release)
    const task = await taskService.transitionPhase(id, body.phase);

    // Fire-and-forget: kick off orchestration for the new phase
    const newPhase = body.phase as Phase;

    const mark2Dir = getMark2Dir();
    const projectRoot = getProjectRoot();

    if (newPhase === 'done') {
      // Handle done phase: create PR and cleanup
      const targetBranch = body.target_branch ?? 'main';
      try {
        const result = await handleDone(task, projectRoot, mark2Dir, targetBranch);
        return NextResponse.json({ task, merge_result: result });
      } catch (err: any) {
        return NextResponse.json(
          { task, error: err.message ?? 'PR creation failed' },
          { status: 500 },
        );
      }
    }

    if (newPhase !== 'pending') {
      try {
        const engine = OrchestrationEngine.getInstance({
          projectRoot,
          mark2Dir,
          apiBaseUrl: `http://localhost:${process.env.PORT || 3100}`,
          agentToken: process.env.MARK2_AGENT_TOKEN || 'mark2-local',
        });

        // Build loop context when transitioning back to coding
        let loopContext: { testFailures?: string; reviewComments?: string; humanComments?: string } | undefined;

        if (newPhase === 'coding') {
          // Coming back from code_review - include review feedback
          if (previousPhase === 'code_review') {
            // Look for artifacts with "review" in the name (e.g., "code-review", "review")
            const { content } = artifactService.getMostRecentContent(id, 'review');
            if (content) {
              loopContext = { reviewComments: content };
            }
          }
          // Coming back from testing - include test results
          else if (previousPhase === 'testing') {
            // Look for artifacts with "test" in the name (e.g., "test-results")
            const { content } = artifactService.getMostRecentContent(id, 'test');
            if (content) {
              loopContext = { testFailures: content };
            }
          }
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
        }

        // Don't await — let orchestration run in background
        engine.startPhase(id, newPhase, loopContext).catch((err) => {
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
    if (error.message?.includes('locked by')) {
      // Lock conflict error
      return NextResponse.json(
        { error: error.message, locked: true },
        { status: 409 }, // Conflict
      );
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
