import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { ArtifactService } from '@/lib/services/artifact-service';
import { TaskService } from '@/lib/services/task-service';

const service = new ArtifactService();
const taskService = new TaskService();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const artifactPath = searchParams.get('path');

    if (!artifactPath) {
      // Return list of artifacts
      const artifacts = service.getForTask(id);
      return NextResponse.json({ artifacts });
    }

    // Resolve file content from the task's worktree
    const task = taskService.getById(id);
    if (!task) {
      return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
    }

    // Try worktree first (where agents actually write files)
    const projectRoot = process.cwd();
    const worktreePath = path.join(projectRoot, '.worktrees', id, 'design');
    const fullPath = path.join(worktreePath, artifactPath);

    // Security: ensure the resolved path is within the worktree
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(worktreePath))) {
      return NextResponse.json({ error: 'Invalid artifact path' }, { status: 400 });
    }

    if (fs.existsSync(resolved)) {
      const content = fs.readFileSync(resolved, 'utf-8');
      return NextResponse.json({ content, path: artifactPath });
    }

    // Fallback: try .mark2/artifacts/ directory
    const mark2Dir = path.join(projectRoot, '.mark2');
    const fallbackPath = path.join(mark2Dir, 'artifacts', artifactPath);
    const resolvedFallback = path.resolve(fallbackPath);
    if (!resolvedFallback.startsWith(path.resolve(mark2Dir))) {
      return NextResponse.json({ error: 'Invalid artifact path' }, { status: 400 });
    }

    if (fs.existsSync(resolvedFallback)) {
      const content = fs.readFileSync(resolvedFallback, 'utf-8');
      return NextResponse.json({ content, path: artifactPath });
    }

    return NextResponse.json({ error: 'Artifact file not found', path: artifactPath }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to get artifact' },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body.name || !body.phase || !body.path) {
      return NextResponse.json(
        { error: 'name, phase, and path are required' },
        { status: 400 },
      );
    }

    const artifact = service.report(id, {
      name: body.name,
      phase: body.phase,
      path: body.path,
      mime_type: body.mime_type,
    });

    return NextResponse.json({ artifact }, { status: 201 });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error.name === 'ZodError' || error.issues) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues ?? error.message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error.message ?? 'Failed to report artifact' },
      { status: 500 },
    );
  }
}
