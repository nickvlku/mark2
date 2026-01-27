import { NextResponse } from 'next/server';
import { StoryService } from '@/lib/services/story-service';

const service = new StoryService();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as any;

    const stories = service.list(status ? { status } : undefined);
    return NextResponse.json({ stories });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to list stories' },
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

    const story = service.create({
      title: body.title,
      description: body.description,
      created_by: body.created_by,
    });

    return NextResponse.json({ story }, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError' || error.issues) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues ?? error.message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error.message ?? 'Failed to create story' },
      { status: 500 },
    );
  }
}
