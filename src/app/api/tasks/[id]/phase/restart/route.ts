import { NextResponse } from 'next/server';
import path from 'path';
import { TaskService } from '@/lib/services/task-service';
import { ActivityService } from '@/lib/services/activity-service';
import { ArtifactService } from '@/lib/services/artifact-service';
import { OrchestrationEngine } from '@/lib/orchestration/engine';

const taskService = new TaskService();
const activityService = new ActivityService();
const artifactService = new ArtifactService();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const task = taskService.getById(id);
    if (!task) {
      return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
    }

    const currentPhase = task.phase;
    if (currentPhase === 'pending' || currentPhase === 'done') {
      return NextResponse.json(
        { error: `Cannot restart phase "${currentPhase}"` },
        { status: 400 },
      );
    }

    // Gather context: human comments and artifact summaries
    const recentActivity = activityService.getForTask(id, 50);
    const humanComments = recentActivity
      .filter((e) => e.type === 'comment' && e.source === 'human')
      .map((e) => e.message);

    const testFailures = recentActivity
      .filter((e) => e.type === 'error' && e.source === 'testing')
      .map((e) => e.message);

    const reviewComments = recentActivity
      .filter((e) => e.type === 'comment' && e.source === 'code_review')
      .map((e) => e.message);

    const loopContext: {
      humanComments?: string;
      testFailures?: string;
      reviewComments?: string;
    } = {};

    if (humanComments.length > 0) {
      loopContext.humanComments = humanComments.join('\n---\n');
    }
    if (testFailures.length > 0) {
      loopContext.testFailures = testFailures.join('\n---\n');
    }
    if (reviewComments.length > 0) {
      loopContext.reviewComments = reviewComments.join('\n---\n');
    }

    const projectRoot = process.cwd();
    const mark2Dir = path.join(projectRoot, '.mark2');
    const engine = OrchestrationEngine.getInstance({
      projectRoot,
      mark2Dir,
      apiBaseUrl: `http://localhost:${process.env.PORT || 3100}`,
      agentToken: process.env.MARK2_AGENT_TOKEN || 'mark2-local',
    });

    // Fire-and-forget: kill existing session and re-spawn with context
    const hasContext = Object.keys(loopContext).length > 0;
    engine.startPhase(id, currentPhase, hasContext ? loopContext : undefined).catch((err) => {
      console.error(`[orchestration] Failed to restart phase ${currentPhase} for ${id}:`, err.message);
    });

    return NextResponse.json({ task, restarted_phase: currentPhase });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to restart phase' },
      { status: 500 },
    );
  }
}
