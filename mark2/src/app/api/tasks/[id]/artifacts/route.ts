import { NextResponse } from 'next/server';
import { ArtifactService } from '@/lib/services/artifact-service';

const service = new ArtifactService();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body.name || !body.phase || !body.path) {
      return NextResponse.json(
        { error: 'name, phase, and path are required' },
        { status: 400 },
      );
    }

    const artifact = service.report(id, {
      name: body.name,
      phase: body.phase,
      path: body.path,
      mime_type: body.mime_type,
    });

    return NextResponse.json({ artifact }, { status: 201 });
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
      { error: error.message ?? 'Failed to report artifact' },
      { status: 500 },
    );
  }
}
