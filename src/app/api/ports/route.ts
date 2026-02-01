import { NextResponse } from 'next/server';
import { createPortService } from '@/lib/services/factory';

const service = createPortService();

export async function GET() {
  try {
    const allocations = service.list();
    return NextResponse.json({ allocations });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to list port allocations' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.task_id) {
      return NextResponse.json(
        { error: 'task_id is required' },
        { status: 400 },
      );
    }

    const allocation = service.allocate(
      body.task_id,
      body.base_port,
      body.ports_per_task,
    );

    return NextResponse.json({ allocation }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to allocate ports' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('task_id');

    if (!taskId) {
      return NextResponse.json(
        { error: 'task_id query parameter is required' },
        { status: 400 },
      );
    }

    service.release(taskId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to release ports' },
      { status: 500 },
    );
  }
}
