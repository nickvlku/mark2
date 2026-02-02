import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { createConfigService } from '@/lib/services/factory';

const service = createConfigService();

function getGitUserEmail(): string {
  try {
    return execSync('git config user.email', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return 'unknown@localhost';
  }
}

export async function GET() {
  try {
    const config = service.get();
    const userEmail = getGitUserEmail();
    return NextResponse.json({ config, userEmail });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to get config' },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const config = service.update(body);
    return NextResponse.json({ config });
  } catch (error: any) {
    if (error.name === 'ZodError' || error.issues) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues ?? error.message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error.message ?? 'Failed to update config' },
      { status: 500 },
    );
  }
}
