import { NextResponse } from 'next/server';
import { getBranches } from '@/lib/utils/git';

export async function GET() {
  try {
    const projectRoot = process.cwd();
    const { branches, current } = await getBranches(projectRoot);

    return NextResponse.json({ branches, current });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to get branches' },
      { status: 500 },
    );
  }
}
