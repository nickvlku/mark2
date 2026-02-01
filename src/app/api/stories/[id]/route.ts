import { NextResponse } from 'next/server';
import { createStoryService } from '@/lib/services/factory';
import { isValidStoryId } from '@/lib/utils/route-validation';

const service = createStoryService();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidStoryId(id)) {
      return NextResponse.json({ error: 'Invalid story ID' }, { status: 400 });
    }
    const story = service.getById(id);
    if (!story) {
      return NextResponse.json({ error: `Story ${id} not found` }, { status: 404 });
    }
    const status = service.getStatus(id);
    return NextResponse.json({ story: { ...story, status } });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to get story' },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidStoryId(id)) {
      return NextResponse.json({ error: 'Invalid story ID' }, { status: 400 });
    }
    const body = await request.json();
    const story = service.update(id, body);
    return NextResponse.json({ story });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error.name === 'ZodError' || error.issues) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues ?? error.message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error.message ?? 'Failed to update story' },
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
    service.delete(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to delete story' },
      { status: 500 },
    );
  }
}
