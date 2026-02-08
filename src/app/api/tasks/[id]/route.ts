import { NextResponse } from 'next/server';
import { createTaskService } from '@/lib/services/factory';
import { isValidTaskId } from '@/lib/utils/route-validation';

const service = createTaskService();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidTaskId(id)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }

    // Sync artifacts from storage before returning task
    service.syncArtifactsFromStorage(id);

    const task = service.getById(id);
    if (!task) {
      return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
    }

    // Include session status
    const session_status = await service.getSessionStatus(id);

    return NextResponse.json({ task: { ...task, session_status } });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to get task' },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidTaskId(id)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }
    const body = await request.json();
    // Convert null story_id to undefined (JSON can't represent undefined)
    if ('story_id' in body && body.story_id === null) {
      body.story_id = undefined;
    }
    const task = await service.update(id, body);
    return NextResponse.json({ task });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error.name === 'ZodError' || error.issues) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues ?? error.message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error.message ?? 'Failed to update task' },
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
    service.delete(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to delete task' },
      { status: 500 },
    );
  }
}
