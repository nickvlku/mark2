import { NextResponse } from 'next/server';
import { CloneService } from '@/lib/services/clone-service';
import { TaskService } from '@/lib/services/task-service';

const cloneService = new CloneService();
const taskService = new TaskService();

// ---------------------------------------------------------------------------
// POST /api/tasks/[id]/git/sync — Sync task clone with latest from main
// ---------------------------------------------------------------------------

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const task = taskService.getById(id);
    if (!task) {
      return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
    }

    if (!cloneService.cloneExists(id)) {
      return NextResponse.json(
        { error: 'Clone does not exist' },
        { status: 404 },
      );
    }

    const result = await cloneService.sync(id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? 'Failed to sync' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      rebased: result.rebased,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to sync' },
      { status: 500 },
    );
  }
}
