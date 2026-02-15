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
    const result = await storyRunService.startStory(id, {
      base_branch: body.base_branch,
      target_branch: body.target_branch,
    });

    return NextResponse.json({
      success: true,
      story_id: result.story_id,
      branch_name: result.branch_name,
      ready_task_ids: result.ready_task_ids,
      started_task_ids: result.started_task_ids,
      failed: result.failed,
    });
  } catch (error: any) {
    if (String(error?.message ?? '').includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: error?.message ?? 'Failed to start story run' },
      { status: 500 },
    );
  }
}

