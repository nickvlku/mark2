import { NextResponse } from 'next/server';
import { PRService } from '@/lib/services/pr-service';
import { isValidTaskId } from '@/lib/utils/route-validation';

const service = new PRService();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidTaskId(id)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }

    // Parse optional target branch from request body
    let targetBranch = 'main';
    try {
      const body = await request.json();
      if (body.target_branch) {
        targetBranch = body.target_branch;
      }
    } catch {
      // No body or invalid JSON - use default
    }

    const result = await service.createPR(id, targetBranch);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 },
      );
    }

    return NextResponse.json({
      pr_url: result.url,
      pr_number: result.number,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to create PR' },
      { status: 500 },
    );
  }
}
