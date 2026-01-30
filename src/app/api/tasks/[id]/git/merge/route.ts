import { NextResponse } from 'next/server';
import { CloneService } from '@/lib/services/clone-service';
import { TaskService } from '@/lib/services/task-service';

const cloneService = new CloneService();
const taskService = new TaskService();

// ---------------------------------------------------------------------------
// POST /api/tasks/[id]/git/merge — Merge task branch into main
// ---------------------------------------------------------------------------

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

    const body = await request.json().catch(() => ({}));
    const strategy = body.strategy as 'merge' | 'squash' | 'rebase' | undefined;

    const result = await cloneService.merge(id, strategy || 'squash');

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error ?? 'Failed to merge',
          conflicts: result.conflicts,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      sha: result.sha,
      strategy: strategy || 'squash',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to merge' },
      { status: 500 },
    );
  }
}
