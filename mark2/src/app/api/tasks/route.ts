import { NextResponse } from 'next/server';
import { TaskService } from '@/lib/services/task-service';

const service = new TaskService();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filters: Record<string, string | boolean | undefined> = {};

    const phase = searchParams.get('phase');
    const priority = searchParams.get('priority');
    const story_id = searchParams.get('story_id');
    const blocked = searchParams.get('blocked');

    if (phase) filters.phase = phase;
    if (priority) filters.priority = priority;
    if (story_id) filters.story_id = story_id;
    if (blocked !== null) filters.blocked = blocked === 'true';

    const tasks = service.list(filters as any);
    return NextResponse.json({ tasks });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to list tasks' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.title || !body.description || !body.created_by) {
      return NextResponse.json(
        { error: 'title, description, and created_by are required' },
        { status: 400 },
      );
    }

    const task = service.create({
      title: body.title,
      description: body.description,
      priority: body.priority,
      blockers: body.blockers,
      assigned_agents: body.assigned_agents,
      story_id: body.story_id,
      parent_task: body.parent_task,
      created_by: body.created_by,
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError' || error.issues) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues ?? error.message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error.message ?? 'Failed to create task' },
      { status: 500 },
    );
  }
}
