import { NextResponse } from 'next/server';
import { ConfigService } from '@/lib/services/config-service';

const service = new ConfigService();

export async function GET() {
  try {
    const agents = service.getAgents();
    return NextResponse.json({ agents });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to get agents' },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();

    if (!body.agents || !Array.isArray(body.agents)) {
      return NextResponse.json(
        { error: 'agents array is required' },
        { status: 400 },
      );
    }

    const agents = service.updateAgents(body.agents);
    return NextResponse.json({ agents });
  } catch (error: any) {
    if (error.name === 'ZodError' || error.issues) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues ?? error.message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error.message ?? 'Failed to update agents' },
      { status: 500 },
    );
  }
}
