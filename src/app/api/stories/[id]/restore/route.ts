import { NextResponse } from 'next/server';
import { createStoryService } from '@/lib/services/factory';
import { isValidStoryId } from '@/lib/utils/route-validation';

const service = createStoryService();

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidStoryId(id)) {
      return NextResponse.json({ error: 'Invalid story ID' }, { status: 400 });
    }

    const result = await service.restore(id);
    return NextResponse.json(result);
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error.message?.includes('archived')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error.message ?? 'Failed to restore story' },
      { status: 500 },
    );
  }
}
