import { NextResponse } from 'next/server';
import { ConfigService } from '@/lib/services/config-service';
import { RoleSchema } from '@/lib/yaml/schemas';
import { z } from 'zod';

const service = new ConfigService();

export async function GET() {
  try {
    const roles = service.getRoles();
    return NextResponse.json({ roles });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to get roles' },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();

    if (!body.roles || !Array.isArray(body.roles)) {
      return NextResponse.json(
        { error: 'roles array is required' },
        { status: 400 },
      );
    }

    // Validate each role
    const rolesArray = z.array(RoleSchema);
    const parseResult = rolesArray.safeParse(body.roles);
    
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.issues },
        { status: 400 },
      );
    }

    const roles = service.updateRoles(parseResult.data);
    return NextResponse.json({ roles });
  } catch (error: any) {
    if (error.name === 'ZodError' || error.issues) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues ?? error.message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error.message ?? 'Failed to update roles' },
      { status: 500 },
    );
  }
}
