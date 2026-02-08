import { NextResponse } from 'next/server';
import { createTaskService } from '@/lib/services/factory';

const service = createTaskService();

export async function POST() {
  try {
    const result = await service.archiveDone();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to archive done tasks' },
      { status: 500 }
    );
  }
}
