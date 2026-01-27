import { NextResponse } from 'next/server';
import { ActivityService } from '@/lib/services/activity-service';

const service = new ActivityService();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body.source || !body.type || !body.message) {
      return NextResponse.json(
        { error: 'source, type, and message are required' },
        { status: 400 },
      );
    }

    const entry = service.log(
      id,
      body.source,
      body.type,
      body.message,
      body.metadata,
    );

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError' || error.issues) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues ?? error.message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error.message ?? 'Failed to log activity' },
      { status: 500 },
    );
  }
}
