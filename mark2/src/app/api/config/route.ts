import { NextResponse } from 'next/server';
import { ConfigService } from '@/lib/services/config-service';

const service = new ConfigService();

export async function GET() {
  try {
    const config = service.get();
    return NextResponse.json({ config });
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
