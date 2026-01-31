import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { ArtifactService } from '@/lib/services/artifact-service';
import { TaskService } from '@/lib/services/task-service';
import { resolveArtifactPath, fileExistsSync } from '@/lib/utils/storage';
import { isValidTaskId } from '@/lib/utils/route-validation';

const service = new ArtifactService();
const taskService = new TaskService();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidTaskId(id)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }
    const { searchParams } = new URL(request.url);
    const artifactPath = searchParams.get('path');

    if (!artifactPath) {
      // Return list of artifacts
      const artifacts = service.getForTask(id);
      return NextResponse.json({ artifacts });
    }

    // Resolve file content from the task's storage or worktree
    const task = taskService.getById(id);
    if (!task) {
      return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
    }

    // Find the artifact to get its phase
    const artifact = task.artifacts?.find(a => a.path === artifactPath);
    const phase = artifact?.phase ?? task.phase;

    const mark2Dir = path.join(process.cwd(), '.mark2');
    const projectRoot = path.dirname(mark2Dir);

    let storagePath: string;
    try {
      storagePath = resolveArtifactPath(projectRoot, id, artifactPath);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid path';
      if (message === 'Path escapes artifact directory') {
        return NextResponse.json({ error: message }, { status: 400 });
      }
      throw err;
    }
    const resolvedStorage = path.resolve(storagePath);

    // Security: ensure the resolved path is within storage
    const storageRoot = path.resolve(path.join(mark2Dir, 'storage', id));
    if (resolvedStorage.startsWith(storageRoot) && fileExistsSync(resolvedStorage)) {
      const content = fs.readFileSync(resolvedStorage, 'utf-8');
      return NextResponse.json({ content, path: artifactPath, location: 'storage' });
    }

    // 2. FALLBACK: Try worktree with phase subdirectory (legacy structure)
    // Worktree path: .worktrees/{task-id}/{phase}/{path}
    const worktreePath = path.join(projectRoot, '.worktrees', id, phase);
    const fullPath = path.join(worktreePath, artifactPath);
    const resolved = path.resolve(fullPath);

    // Security: ensure the resolved path is within the worktree
    if (resolved.startsWith(path.resolve(worktreePath)) && fs.existsSync(resolved)) {
      const content = fs.readFileSync(resolved, 'utf-8');
      return NextResponse.json({ content, path: artifactPath, location: 'worktree' });
    }

    // 3. FALLBACK: Try worktree without phase subdirectory (flat worktree)
    const flatWorktreePath = path.join(projectRoot, '.worktrees', id);
    const flatFullPath = path.join(flatWorktreePath, artifactPath);
    const flatResolved = path.resolve(flatFullPath);
    if (flatResolved.startsWith(path.resolve(flatWorktreePath)) && fs.existsSync(flatResolved)) {
      const content = fs.readFileSync(flatResolved, 'utf-8');
      return NextResponse.json({ content, path: artifactPath, location: 'worktree-flat' });
    }

    // 4. FALLBACK: Try legacy .mark2/artifacts/ directory
    const fallbackPath = path.join(mark2Dir, 'artifacts', artifactPath);
    const resolvedFallback = path.resolve(fallbackPath);
    if (resolvedFallback.startsWith(path.resolve(mark2Dir)) && fs.existsSync(resolvedFallback)) {
      const content = fs.readFileSync(resolvedFallback, 'utf-8');
      return NextResponse.json({ content, path: artifactPath, location: 'legacy' });
    }

    return NextResponse.json({
      error: 'Artifact file not found',
      path: artifactPath,
      searched: [resolvedStorage, resolved, flatResolved, resolvedFallback]
    }, { status: 404 });
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
    if (!isValidTaskId(id)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }
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
