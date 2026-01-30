import { NextResponse } from 'next/server';
import path from 'path';
import { TaskService } from '@/lib/services/task-service';
import { ActivityService } from '@/lib/services/activity-service';
import { OrchestrationEngine } from '@/lib/orchestration/engine';
import { TmuxManager } from '@/lib/orchestration/tmux-manager';

const taskService = new TaskService();
const activityService = new ActivityService();

/**
 * POST /api/tasks/[id]/phase/hook-complete
 *
 * Called by the Claude Code Stop hook when an end token is detected.
 * This endpoint processes the end token and triggers the appropriate
 * phase transition.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { token, session_id, transcript_path } = body;

    if (!token) {
      return NextResponse.json(
        { error: 'token is required' },
        { status: 400 },
      );
    }

    // Get the task
    const task = taskService.getById(id);
    if (!task) {
      return NextResponse.json(
        { error: `Task ${id} not found` },
        { status: 404 },
      );
    }

    // Log the hook detection
    activityService.log(
      id,
      'hook',
      'phase_change',
      `End token "${token}" detected via Claude Code hook`,
      {
        token,
        session_id,
        transcript_path,
        phase: task.phase,
      },
    );

    console.log(`[hook-complete] Processing end token "${token}" for task ${id} (phase: ${task.phase})`);

    // Get the orchestration engine and process the end token
    const projectRoot = process.cwd();
    const mark2Dir = path.join(projectRoot, '.mark2');

    const engine = OrchestrationEngine.getInstance({
      projectRoot,
      mark2Dir,
      apiBaseUrl: `http://localhost:${process.env.PORT || 3100}`,
      agentToken: process.env.MARK2_AGENT_TOKEN || 'mark2-local',
    });

    // Find the session for this task to get agent name
    const tmuxManager = new TmuxManager(mark2Dir);
    let activeSession = tmuxManager.getActiveSessionForTask(id);

    if (!activeSession) {
      // Try to find the most recent session for this task (may have just completed)
      const allSessions = tmuxManager.getSessionsForTask(id);
      if (allSessions.length > 0) {
        // Sort by started_at descending and get the most recent
        activeSession = allSessions.sort((a, b) =>
          new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
        )[0];
        console.log(`[hook-complete] Using most recent session for task ${id}: ${activeSession.tmux_session} (status: ${activeSession.status})`);
      }
    }

    if (!activeSession) {
      console.warn(`[hook-complete] No session found for task ${id}`);
    }

    const agentName = activeSession?.agent_name ?? 'unknown';

    // Process the end token (this handles phase transitions)
    await engine.processEndToken(id, agentName, task.phase, token);

    return NextResponse.json({
      success: true,
      message: `End token "${token}" processed`,
      task_id: id,
      phase: task.phase,
    });
  } catch (error: any) {
    console.error('[hook-complete] Error:', error);
    return NextResponse.json(
      { error: error.message ?? 'Failed to process hook completion' },
      { status: 500 },
    );
  }
}
