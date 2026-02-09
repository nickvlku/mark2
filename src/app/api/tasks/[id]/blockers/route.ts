import { NextResponse } from 'next/server';
import { createTaskService, createStoryRunService } from '@/lib/services/factory';
import { isValidTaskId } from '@/lib/utils/route-validation';

const service = createTaskService();
const storyRunService = createStoryRunService();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidTaskId(id)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }

    const task = service.getById(id);
    if (!task) {
      return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
    }

    // Blockers: tasks that block this task (resolve full task objects)
    const blockerTasks = task.blockers
      .map((blockerId) => service.getById(blockerId))
      .filter((t): t is NonNullable<typeof t> => t !== null);

    // Blocking: tasks that this task blocks (reverse lookup)
    const blockingTasks = service.getBlocking(id);

    return NextResponse.json({
      blockers: blockerTasks,
      blocking: blockingTasks,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to get dependencies' },
      { status: 500 },
    );
  }
}

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

    if (!body.blocker_id) {
      return NextResponse.json(
        { error: 'blocker_id is required' },
        { status: 400 },
      );
    }

    const task = await service.addBlocker(id, body.blocker_id);
    return NextResponse.json({ task });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error.message?.toLowerCase().includes('circular')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error.message ?? 'Failed to add blocker' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidTaskId(id)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }
    const { searchParams } = new URL(request.url);
    const blockerId = searchParams.get('blocker_id');

    if (!blockerId) {
      return NextResponse.json(
        { error: 'blocker_id query parameter is required' },
        { status: 400 },
      );
    }

    const task = await service.removeBlocker(id, blockerId);

    // If task belongs to a running story, attempt auto-start for newly ready tasks.
    if (task.story_id) {
      await storyRunService.startReadyTasks(task.story_id).catch(() => {});
      await storyRunService.refreshReadyToMergeStatus(task.story_id).catch(() => {});
    }

    return NextResponse.json({ task });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: error.message ?? 'Failed to remove blocker' },
      { status: 500 },
    );
  }
}
