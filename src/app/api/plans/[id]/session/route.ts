import { NextResponse } from 'next/server';
import { isValidPlanId } from '@/lib/utils/route-validation';
import {
  getTerminalSessionResponse,
  resolveActiveTerminalSession,
} from '@/lib/terminal/terminal-target-resolver';
import { openTmuxSessionInNativeTerminal } from '@/lib/terminal/native-terminal';

// ---------------------------------------------------------------------------
// GET /api/plans/[id]/session — Return tmux session metadata for a plan
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidPlanId(id)) {
      return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
    }

    return NextResponse.json(
      await getTerminalSessionResponse({ kind: 'plan', id }),
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to get session' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/plans/[id]/session — Open tmux session in native terminal
// ---------------------------------------------------------------------------

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidPlanId(id)) {
      return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
    }

    const session = await resolveActiveTerminalSession({ kind: 'plan', id });
    if (!session) {
      return NextResponse.json(
        { error: 'No active tmux session for this plan' },
        { status: 404 },
      );
    }

    const result = await openTmuxSessionInNativeTerminal(session.tmux_session);
    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error,
          manual_command: result.manual_command,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to open terminal' },
      { status: 500 },
    );
  }
}
