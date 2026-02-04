import { NextResponse } from 'next/server';
import { createTaskService, createEnhanceService } from '@/lib/services/factory';
import { isValidTaskId } from '@/lib/utils/route-validation';

const taskService = createTaskService();
const enhanceService = createEnhanceService();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isValidTaskId(id)) {
      return NextResponse.json(
        { error: 'Invalid task ID' },
        { status: 400 }
      );
    }

    const task = taskService.getById(id);
    if (!task) {
      return NextResponse.json(
        { error: `Task ${id} not found`, code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Only allow enhancement in pending phase
    if (task.phase !== 'pending') {
      return NextResponse.json(
        { error: 'Task must be in pending phase to enhance', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));

    const result = await enhanceService.enhanceTask(task, {
      role: body.role,
      cli_tool: body.cli_tool,
      model: body.model,
    });

    return NextResponse.json({
      original_title: task.title,
      original_description: task.description,
      enhanced_title: result.enhanced_title,
      enhanced_description: result.enhanced_description,
    });
  } catch (error: any) {
    console.error('Enhancement failed:', error);

    const code = error.message?.includes('PARSE_ERROR') ? 'PARSE_ERROR'
      : error.message?.includes('TIMEOUT') ? 'TIMEOUT'
      : 'AI_ERROR';

    return NextResponse.json(
      { error: error.message || 'Enhancement failed', code },
      { status: 500 }
    );
  }
}
