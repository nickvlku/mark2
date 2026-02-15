import { NextResponse } from 'next/server';
import { createStoryRunService } from '@/lib/services/factory';
import { isValidStoryId } from '@/lib/utils/route-validation';

const storyRunService = createStoryRunService();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidStoryId(id)) {
      return NextResponse.json({ error: 'Invalid story ID' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const result = await storyRunService.createMergePR(id, body.target_branch);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? 'Failed to create merge PR' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      pr_url: result.url,
      pr_number: result.number,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? 'Failed to create merge PR' },
      { status: 500 },
    );
  }
}

