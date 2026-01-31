import { NextResponse } from 'next/server';
import { ReindexService } from '@/lib/services/reindex-service';
import path from 'path';

export async function POST() {
  try {
    const mark2Dir = path.join(process.cwd(), '.mark2');
    const service = new ReindexService(mark2Dir);
    const result = await service.fullReindex();

    return NextResponse.json({
      tasks_indexed: result.tasks_indexed,
      stories_indexed: result.stories_indexed,
      activities_indexed: result.activities_indexed,
      errors: result.errors,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to reindex';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
