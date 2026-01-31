import { NextResponse } from 'next/server';
import path from 'path';
import {
  getTaskStoragePaths,
  ensureTaskStorageExists,
  getStorageStats,
  fileExistsSync,
} from '@/lib/utils/storage';
import { TaskService } from '@/lib/services/task-service';
import { isValidTaskId } from '@/lib/utils/route-validation';

const taskService = new TaskService();

/**
 * GET /api/tasks/{id}/storage
 *
 * Returns storage information for a task.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidTaskId(id)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }

    // Verify task exists
    const task = taskService.getById(id);
    if (!task) {
      return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
    }

    const mark2Dir = path.join(process.cwd(), '.mark2');
    const projectRoot = path.dirname(mark2Dir);

    const paths = getTaskStoragePaths(projectRoot, id);
    const stats = await getStorageStats(projectRoot, id);

    return NextResponse.json({
      taskId: id,
      paths: {
        root: paths.root,
        prompts: paths.prompts,
        artifacts: paths.artifacts,
        sessions: paths.sessions,
        testRuns: paths.testRuns,
        playwrightReports: paths.playwrightReports,
      },
      exists: {
        root: fileExistsSync(paths.root),
        prompts: fileExistsSync(paths.prompts),
        artifacts: fileExistsSync(paths.artifacts),
        sessions: fileExistsSync(paths.sessions),
        testRuns: fileExistsSync(paths.testRuns),
        playwrightReports: fileExistsSync(paths.playwrightReports),
      },
      stats,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to get storage info' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/tasks/{id}/storage/init
 *
 * Initializes storage directories for a task.
 * This is normally done automatically on task creation,
 * but can be called manually if needed.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidTaskId(id)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }

    // Verify task exists
    const task = taskService.getById(id);
    if (!task) {
      return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
    }

    const mark2Dir = path.join(process.cwd(), '.mark2');
    const projectRoot = path.dirname(mark2Dir);

    await ensureTaskStorageExists(projectRoot, id);

    const paths = getTaskStoragePaths(projectRoot, id);

    return NextResponse.json({
      message: `Storage initialized for task ${id}`,
      paths: {
        root: paths.root,
        prompts: paths.prompts,
        artifacts: paths.artifacts,
        sessions: paths.sessions,
        testRuns: paths.testRuns,
        playwrightReports: paths.playwrightReports,
      },
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to initialize storage' },
      { status: 500 },
    );
  }
}
