import { NextResponse } from 'next/server';
import { createCloneService, createTaskService } from '@/lib/services/factory';
import { isValidTaskId } from '@/lib/utils/route-validation';

const cloneService = createCloneService();
const taskService = createTaskService();

// ---------------------------------------------------------------------------
// POST /api/tasks/[id]/git/push — Push task branch to origin
// ---------------------------------------------------------------------------

export async function POST(
  _request: Request,
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
        { error: 'Clone does not exist' },
        { status: 404 },
      );
    }

    const result = await cloneService.push(id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? 'Failed to push' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      branch: cloneService.getBranchName(id),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to push' },
      { status: 500 },
    );
  }
}
