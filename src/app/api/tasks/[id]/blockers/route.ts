import { NextResponse } from 'next/server';
import { TaskService } from '@/lib/services/task-service';

const service = new TaskService();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body.blocker_id) {
      return NextResponse.json(
        { error: 'blocker_id is required' },
        { status: 400 },
      );
    }

    const task = service.addBlocker(id, body.blocker_id);
    return NextResponse.json({ task });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
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
    const { searchParams } = new URL(request.url);
    const blockerId = searchParams.get('blocker_id');

    if (!blockerId) {
      return NextResponse.json(
        { error: 'blocker_id query parameter is required' },
        { status: 400 },
      );
    }

    const task = service.removeBlocker(id, blockerId);
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
