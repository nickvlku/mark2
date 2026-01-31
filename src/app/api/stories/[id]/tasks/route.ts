import { NextResponse } from 'next/server';
import { StoryService } from '@/lib/services/story-service';
import { isValidStoryId } from '@/lib/utils/route-validation';

const service = new StoryService();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidStoryId(id)) {
      return NextResponse.json({ error: 'Invalid story ID' }, { status: 400 });
    }
    const body = await request.json();

    if (!body.task_id) {
      return NextResponse.json(
        { error: 'task_id is required' },
        { status: 400 },
      );
    }

    const story = service.addTask(id, body.task_id);
    return NextResponse.json({ story });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: error.message ?? 'Failed to add task to story' },
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
    if (!isValidStoryId(id)) {
      return NextResponse.json({ error: 'Invalid story ID' }, { status: 400 });
    }
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('task_id');

    if (!taskId) {
      return NextResponse.json(
        { error: 'task_id query parameter is required' },
        { status: 400 },
      );
    }

    const story = service.removeTask(id, taskId);
    return NextResponse.json({ story });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: error.message ?? 'Failed to remove task from story' },
      { status: 500 },
    );
  }
}
