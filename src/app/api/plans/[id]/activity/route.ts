import { NextResponse } from 'next/server';
import { createActivityService } from '@/lib/services/factory';
import { isValidPlanId } from '@/lib/utils/route-validation';

const service = createActivityService();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidPlanId(id)) {
      return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
    }
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    const entries = service.getForTask(
      id,
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined,
    );

    return NextResponse.json({ task_id: id, entries });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to get activity' },
      { status: 500 },
    );
  }
}
