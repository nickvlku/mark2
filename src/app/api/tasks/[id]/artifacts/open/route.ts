import { NextRequest, NextResponse } from 'next/server';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { TaskService } from '@/lib/services/task-service';
import { resolveArtifactPath, fileExistsSync } from '@/lib/utils/storage';

const exec = promisify(execCb);
const taskService = new TaskService();

// ---------------------------------------------------------------------------
// POST /api/tasks/[id]/artifacts/open — Open artifact in IDE
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { path: artifactPath } = await request.json();

    if (!artifactPath) {
      return NextResponse.json(
        { error: 'Missing artifact path' },
        { status: 400 },
      );
    }

    const task = taskService.getById(id);
    if (!task) {
      return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
    }

    // Find the artifact to get its phase
    const artifact = task.artifacts?.find(a => a.path === artifactPath);
    const phase = artifact?.phase ?? task.phase;

    const mark2Dir = path.join(process.cwd(), '.mark2');
    const projectRoot = path.dirname(mark2Dir);

    let resolvedPath: string | null = null;

    // 1. PRIMARY: Check storage location first (new structure)
    const storagePath = resolveArtifactPath(projectRoot, id, artifactPath);
    const resolvedStorage = path.resolve(storagePath);
    const storageRoot = path.resolve(path.join(mark2Dir, 'storage', id));

    if (resolvedStorage.startsWith(storageRoot) && fileExistsSync(resolvedStorage)) {
      resolvedPath = resolvedStorage;
    }

    // 2. FALLBACK: Try worktree with phase subdirectory
    if (!resolvedPath) {
      const worktreePath = path.join(projectRoot, '.worktrees', id, phase);
      const fullPath = path.join(worktreePath, artifactPath);
      const resolved = path.resolve(fullPath);
      if (resolved.startsWith(path.resolve(worktreePath)) && fs.existsSync(resolved)) {
        resolvedPath = resolved;
      }
    }

    // 3. FALLBACK: Try worktree without phase subdirectory
    if (!resolvedPath) {
      const flatWorktreePath = path.join(projectRoot, '.worktrees', id);
      const flatFullPath = path.join(flatWorktreePath, artifactPath);
      const flatResolved = path.resolve(flatFullPath);
      if (flatResolved.startsWith(path.resolve(flatWorktreePath)) && fs.existsSync(flatResolved)) {
        resolvedPath = flatResolved;
      }
    }

    // 4. FALLBACK: Try legacy .mark2/artifacts/ directory
    if (!resolvedPath) {
      const fallbackPath = path.join(mark2Dir, 'artifacts', artifactPath);
      const resolvedFallback = path.resolve(fallbackPath);
      if (resolvedFallback.startsWith(path.resolve(mark2Dir)) && fs.existsSync(resolvedFallback)) {
        resolvedPath = resolvedFallback;
      }
    }

    if (!resolvedPath) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 },
      );
    }

    // Try common IDE commands in order of preference
    const editors = [
      { name: 'cursor', cmd: 'cursor' },
      { name: 'vscode', cmd: 'code' },
      { name: 'zed', cmd: 'zed' },
      { name: 'sublime', cmd: 'subl' },
      { name: 'atom', cmd: 'atom' },
      { name: 'idea', cmd: 'idea' },
    ];

    for (const editor of editors) {
      try {
        await exec(`which ${editor.cmd}`);
        // Editor found, open the file
        await exec(`${editor.cmd} "${resolvedPath}"`);
        return NextResponse.json({
          success: true,
          editor: editor.name,
          path: resolvedPath,
        });
      } catch {
        // Editor not found, try next
      }
    }

    return NextResponse.json(
      { error: 'No supported IDE found', path: resolvedPath },
      { status: 500 },
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to open in IDE' },
      { status: 500 },
    );
  }
}
