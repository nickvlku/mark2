import { NextResponse } from 'next/server';
import { createPlanService } from '@/lib/services/factory';

const service = createPlanService();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const phase = searchParams.get('phase');
    const filters: Record<string, string | undefined> = {};
    if (phase) filters.phase = phase;

    const plans = service.list(filters as any);
    return NextResponse.json({ plans });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to list plans' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.prompt) {
      return NextResponse.json(
        { error: 'prompt is required' },
        { status: 400 },
      );
    }

    const title = body.title || body.prompt.split('\n')[0].slice(0, 100);

    const plan = await service.create({
      title,
      prompt: body.prompt,
      created_by: body.created_by || 'human',
    });

    return NextResponse.json({ plan }, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError' || error.issues) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues ?? error.message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error.message ?? 'Failed to create plan' },
      { status: 500 },
    );
  }
}
