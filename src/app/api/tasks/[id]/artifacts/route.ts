import { NextResponse } from 'next/server';
import path from 'path';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { createArtifactService, createTaskService } from '@/lib/services/factory';
import { getMark2Dir } from '@/lib/utils/mark2-dir';
import { resolveArtifactPath, fileExistsSync } from '@/lib/utils/storage';
import { isValidTaskId } from '@/lib/utils/route-validation';
import { isImageType } from '@/lib/utils/upload';

const service = createArtifactService();
const taskService = createTaskService();

/**
 * Serve a binary file (image/PDF) with proper headers
 */
async function serveBinaryFile(filepath: string, mimeType: string): Promise<NextResponse> {
  const fileBuffer = await readFile(filepath);
  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': mimeType,
      'Content-Length': fileBuffer.length.toString(),
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

/**
 * Check if a file should be served as binary (images and PDFs)
 */
function shouldServeBinary(mimeType: string): boolean {
  return isImageType(mimeType) || mimeType === 'application/pdf';
}

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

    const mark2Dir = getMark2Dir();
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
      const mimeType = artifact?.mime_type || 'application/octet-stream';

      // Serve binary files (especially images) directly
      if (shouldServeBinary(mimeType)) {
        return serveBinaryFile(resolvedStorage, mimeType);
      }

      const content = await readFile(resolvedStorage, 'utf-8');
      return NextResponse.json({ content, path: artifactPath, location: 'storage' });
    }

    // 2. FALLBACK: Try worktree with phase subdirectory (legacy structure)
    // Worktree path: .worktrees/{task-id}/{phase}/{path}
    const worktreePath = path.join(projectRoot, '.worktrees', id, phase);
    const fullPath = path.join(worktreePath, artifactPath);
    const resolved = path.resolve(fullPath);

    // Security: ensure the resolved path is within the worktree
    if (resolved.startsWith(path.resolve(worktreePath)) && existsSync(resolved)) {
      const mimeType = artifact?.mime_type || 'application/octet-stream';

      if (shouldServeBinary(mimeType)) {
        return serveBinaryFile(resolved, mimeType);
      }

      const content = await readFile(resolved, 'utf-8');
      return NextResponse.json({ content, path: artifactPath, location: 'worktree' });
    }

    // 3. FALLBACK: Try worktree without phase subdirectory (flat worktree)
    const flatWorktreePath = path.join(projectRoot, '.worktrees', id);
    const flatFullPath = path.join(flatWorktreePath, artifactPath);
    const flatResolved = path.resolve(flatFullPath);
    if (flatResolved.startsWith(path.resolve(flatWorktreePath)) && existsSync(flatResolved)) {
      const mimeType = artifact?.mime_type || 'application/octet-stream';

      if (shouldServeBinary(mimeType)) {
        return serveBinaryFile(flatResolved, mimeType);
      }

      const content = await readFile(flatResolved, 'utf-8');
      return NextResponse.json({ content, path: artifactPath, location: 'worktree-flat' });
    }

    // 4. FALLBACK: Try legacy .mark2/artifacts/ directory
    const fallbackPath = path.join(mark2Dir, 'artifacts', artifactPath);
    const resolvedFallback = path.resolve(fallbackPath);
    if (resolvedFallback.startsWith(path.resolve(mark2Dir)) && existsSync(resolvedFallback)) {
      const mimeType = artifact?.mime_type || 'application/octet-stream';

      if (shouldServeBinary(mimeType)) {
        return serveBinaryFile(resolvedFallback, mimeType);
      }

      const content = await readFile(resolvedFallback, 'utf-8');
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
