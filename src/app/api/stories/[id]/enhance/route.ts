import { NextResponse } from 'next/server';
import { createStoryService, createEnhanceService } from '@/lib/services/factory';

const storyService = createStoryService();
const enhanceService = createEnhanceService();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate story ID format
    if (!id.match(/^STORY-\d+$/)) {
      return NextResponse.json(
        { error: 'Invalid story ID' },
        { status: 400 }
      );
    }

    const story = storyService.getById(id);
    if (!story) {
      return NextResponse.json(
        { error: `Story ${id} not found`, code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));

    const result = await enhanceService.enhanceStory(story, {
      role: body.role,
      cli_tool: body.cli_tool,
      model: body.model,
    });

    return NextResponse.json({
      original_title: story.title,
      original_description: story.description,
      enhanced_title: result.enhanced_title,
      enhanced_description: result.enhanced_description,
    });
  } catch (error: any) {
    console.error('Enhancement failed:', error);

    const code = error.message?.includes('PARSE_ERROR') ? 'PARSE_ERROR'
      : error.message?.includes('TIMEOUT') ? 'TIMEOUT'
      : 'AI_ERROR';

    return NextResponse.json(
      { error: error.message || 'Enhancement failed', code },
      { status: 500 }
    );
  }
}
