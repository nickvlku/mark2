import { NextResponse } from 'next/server';
import { createTaskService, createStateBranchService } from '@/lib/services/factory';
import { isValidTaskId } from '@/lib/utils/route-validation';

const taskService = createTaskService();
const stateBranchService = createStateBranchService();

/**
 * GET /api/tasks/:id/lock
 * Get lock status for a task
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

    const task = taskService.getById(id);
    if (!task) {
      return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
    }

    const lock = await stateBranchService.getLock(id);

    if (!lock) {
      return NextResponse.json({ locked: false });
    }

    const isExpired = await stateBranchService.isLockExpired(lock);
    const isMine = await stateBranchService.isLockMine(lock);

    return NextResponse.json({
      locked: true,
      lock,
      is_expired: isExpired,
      is_mine: isMine,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to get lock status' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/tasks/:id/lock
 * Acquire lock for a task
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

    const task = taskService.getById(id);
    if (!task) {
      return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const force = body.force === true;

    if (force) {
      const result = await taskService.forceAcquireLock(id);
      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 409 },
        );
      }
      return NextResponse.json({ success: true });
    } else {
      const result = await stateBranchService.acquireLock(id);
      if (!result.success) {
        return NextResponse.json(
          {
            error: result.error,
            existing_lock: result.existingLock,
          },
          { status: 409 }, // Conflict
        );
      }
      return NextResponse.json({
        success: true,
        lock: result.lock,
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to acquire lock' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/tasks/:id/lock
 * Release lock for a task
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidTaskId(id)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }

    const task = taskService.getById(id);
    if (!task) {
      return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
    }

    // Check if we own the lock
    const lock = await stateBranchService.getLock(id);
    if (lock) {
      const isMine = await stateBranchService.isLockMine(lock);
      if (!isMine) {
        return NextResponse.json(
          { error: 'Cannot release lock owned by another user' },
          { status: 403 },
        );
      }
    }

    await stateBranchService.releaseLock(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to release lock' },
      { status: 500 },
    );
  }
}
