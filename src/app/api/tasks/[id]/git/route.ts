import { NextResponse } from 'next/server';
import { CloneService } from '@/lib/services/clone-service';
import { TaskService } from '@/lib/services/task-service';
import { isValidTaskId } from '@/lib/utils/route-validation';

const cloneService = new CloneService();
const taskService = new TaskService();

// ---------------------------------------------------------------------------
// GET /api/tasks/[id]/git — Get git status for task's clone
// ---------------------------------------------------------------------------

export async function GET(
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

    const exists = cloneService.cloneExists(id);
    if (!exists) {
      return NextResponse.json({
        exists: false,
        clonePath: null,
        branchName: null,
        status: null,
        diff: null,
      });
    }

    const clonePath = cloneService.getClonePath(id);
    const branchName = cloneService.getBranchName(id);
    const { status } = await cloneService.getStatus(id);
    const { diff } = await cloneService.getDiff(id);

    return NextResponse.json({
      exists: true,
      clonePath,
      branchName,
      status,
      diff,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to get git status' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/tasks/[id]/git — Create clone for task
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

    const cloneInfo = await cloneService.createClone(id);

    return NextResponse.json({
      success: true,
      clone: cloneInfo,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to create clone' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/tasks/[id]/git — Delete clone for task
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    await cloneService.deleteClone(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to delete clone' },
      { status: 500 },
    );
  }
}
