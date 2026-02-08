import { NextResponse } from 'next/server';
import { createPlanService } from '@/lib/services/factory';
import { getMark2Dir } from '@/lib/utils/mark2-dir';
import { isValidPlanId } from '@/lib/utils/route-validation';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const service = createPlanService();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidPlanId(id)) {
      return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');

    if (!name) {
      return NextResponse.json(
        { error: 'name query parameter is required' },
        { status: 400 },
      );
    }

    const plan = service.getById(id);
    if (!plan) {
      return NextResponse.json({ error: `Plan ${id} not found` }, { status: 404 });
    }

    // Find artifact by name (exact or partial match)
    const artifact = plan.artifacts.find(
      a => a.name === name || a.path === name || a.name.includes(name) || a.path.includes(name)
    );

    if (!artifact) {
      return NextResponse.json(
        { error: `Artifact "${name}" not found` },
        { status: 404 },
      );
    }

    // Read from storage
    const mark2Dir = getMark2Dir();
    const artifactPath = path.join(mark2Dir, 'storage', id, 'artifacts', artifact.path);
    const resolved = path.resolve(artifactPath);

    // Security: ensure path is within storage
    const storageRoot = path.resolve(path.join(mark2Dir, 'storage', id));
    if (!resolved.startsWith(storageRoot)) {
      return NextResponse.json({ error: 'Invalid artifact path' }, { status: 400 });
    }

    if (!existsSync(resolved)) {
      return NextResponse.json(
        { error: `Artifact file not found at ${artifact.path}` },
        { status: 404 },
      );
    }

    const content = await readFile(resolved, 'utf-8');
    return NextResponse.json({ content, artifact });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to get artifact content' },
      { status: 500 },
    );
  }
}
