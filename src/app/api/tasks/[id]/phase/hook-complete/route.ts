import { NextResponse } from 'next/server';
import { createTaskService, createActivityService } from '@/lib/services/factory';
import { getMark2Dir, getProjectRoot } from '@/lib/utils/mark2-dir';
import { OrchestrationEngine } from '@/lib/orchestration/engine';
import { TmuxManager } from '@/lib/orchestration/tmux-manager';
import { isValidTaskId } from '@/lib/utils/route-validation';

const taskService = createTaskService();
const activityService = createActivityService();

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
    if (!isValidTaskId(id)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }
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
    const mark2Dir = getMark2Dir();
    const projectRoot = getProjectRoot();

    const engine = OrchestrationEngine.getInstance({
      projectRoot,
      mark2Dir,
      apiBaseUrl: `http://localhost:${process.env.PORT || 3100}`,
      agentToken: process.env.MARK2_AGENT_TOKEN || 'mark2-local',
    });

    // For the roles system, we simplify agent name resolution
    // The engine can work with a generic role identifier
    const agentName = `role-${task.phase}`;

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
