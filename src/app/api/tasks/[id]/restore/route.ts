import { NextResponse } from 'next/server';
import { createTaskService } from '@/lib/services/factory';
import { isValidTaskId } from '@/lib/utils/route-validation';

const service = createTaskService();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!isValidTaskId(id)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }
    const task = service.restore(id);
    return NextResponse.json({ task });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: error.message ?? 'Failed to restore task' },
      { status: 500 }
    );
  }
}