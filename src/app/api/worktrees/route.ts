import { NextResponse } from 'next/server';
import { WorktreeService } from '@/lib/services/worktree-service';

const service = new WorktreeService();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('task_id');

    if (taskId) {
      const worktrees = service.getForTask(taskId);
      return NextResponse.json({ worktrees });
    }

    const worktrees = service.list();
    return NextResponse.json({ worktrees });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to list worktrees' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.task_id || !body.agent_name) {
      return NextResponse.json(
        { error: 'task_id and agent_name are required' },
        { status: 400 },
      );
    }

    const worktree = await service.create(
      body.task_id,
      body.agent_name,
      body.is_bakeoff ?? false,
    );

    return NextResponse.json({ worktree }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to create worktree' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('task_id');
    const agentName = searchParams.get('agent_name');

    if (!taskId || !agentName) {
      return NextResponse.json(
        { error: 'task_id and agent_name query parameters are required' },
        { status: 400 },
      );
    }

    await service.cleanup(taskId, agentName);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message?.includes('No active worktree found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: error.message ?? 'Failed to cleanup worktree' },
      { status: 500 },
    );
  }
}
