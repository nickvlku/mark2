import { NextResponse } from 'next/server';
import { bakeoffService } from '../route';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const status = bakeoffService.getStatus(id);

    if (!status) {
      return NextResponse.json(
        { error: `Bake-off ${id} not found` },
        { status: 404 },
      );
    }

    return NextResponse.json(status);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to get bake-off status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body.winner_agent) {
      return NextResponse.json(
        { error: 'winner_agent is required' },
        { status: 400 },
      );
    }

    await bakeoffService.selectWinner(id, body.winner_agent);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to select winner';
    if (message.includes('not found') || message.includes('not part of')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await bakeoffService.cancel(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to cancel bake-off';
    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
