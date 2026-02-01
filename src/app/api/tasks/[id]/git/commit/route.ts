import { NextResponse } from 'next/server';
import { createCloneService, createTaskService } from '@/lib/services/factory';
import { isValidTaskId } from '@/lib/utils/route-validation';

const cloneService = createCloneService();
const taskService = createTaskService();

// ---------------------------------------------------------------------------
// POST /api/tasks/[id]/git/commit — Commit changes in task's clone
// ---------------------------------------------------------------------------

export async function POST(
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

    if (!cloneService.cloneExists(id)) {
      return NextResponse.json(
        { error: 'Clone does not exist. Create clone first.' },
        { status: 404 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const message = body.message || `Changes for ${id}`;
    const files = body.files as string[] | undefined;

    // Stage files if specified, otherwise stage all
    if (files && files.length > 0) {
      const stageResult = await cloneService.stageFiles(id, files);
      if (!stageResult.success) {
        return NextResponse.json(
          { error: stageResult.error ?? 'Failed to stage files' },
          { status: 400 },
        );
      }
    } else {
      const stageResult = await cloneService.stageAll(id);
      if (!stageResult.success) {
        return NextResponse.json(
          { error: stageResult.error ?? 'Failed to stage changes' },
          { status: 400 },
        );
      }
    }

    // Commit
    const result = await cloneService.commit(id, message);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? 'Failed to commit' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      sha: result.sha,
      message,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to commit' },
      { status: 500 },
    );
  }
}
