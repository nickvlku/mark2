import { NextResponse } from 'next/server';
import { createTaskService } from '@/lib/services/factory';

const service = createTaskService();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filters: Record<string, string | boolean | undefined> = {};

    const phase = searchParams.get('phase');
    const priority = searchParams.get('priority');
    const story_id = searchParams.get('story_id');
    const blocked = searchParams.get('blocked');
    const archived = searchParams.get('archived');
    const includeStatus = searchParams.get('include_status') !== 'false'; // default true
    const includeLocks = searchParams.get('include_locks') !== 'false'; // default true

    if (phase) filters.phase = phase;
    if (priority) filters.priority = priority;
    if (story_id) filters.story_id = story_id;
    if (blocked !== null) filters.blocked = blocked === 'true';
    if (archived !== null) filters.archived = archived === 'true';

    // Use listWithStatusAndLocks to include session status and lock info for each task
    if (includeStatus && includeLocks) {
      const tasks = await service.listWithStatusAndLocks(filters as any);

      // Also sync artifacts from storage for each task
      for (const task of tasks) {
        service.syncArtifactsFromStorage(task.id);
      }

      return NextResponse.json({ tasks });
    } else if (includeStatus) {
      const tasks = await service.listWithStatus(filters as any);

      // Also sync artifacts from storage for each task
      for (const task of tasks) {
        service.syncArtifactsFromStorage(task.id);
      }

      return NextResponse.json({ tasks });
    } else {
      const tasks = service.list(filters as any);
      return NextResponse.json({ tasks });
    }
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

    if (!body.title) {
      return NextResponse.json(
        { error: 'title is required' },
        { status: 400 },
      );
    }

    const task = await service.create({
      title: body.title,
      description: body.description || '',
      priority: body.priority,
      blockers: body.blockers,
      phase_agents: body.phase_agents, // deprecated
      phase_overrides: body.phase_overrides, // new
      story_id: body.story_id,
      parent_task: body.parent_task,
      created_by: body.created_by || 'human',
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
