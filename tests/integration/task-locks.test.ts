import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { initializeDatabase, closeDb } from '@/lib/db';
import { TaskService } from '@/lib/services/task-service';
import { StateBranchService, LockInfo } from '@/lib/services/state-branch-service';

// Helper to write lock files as JSON (not YAML, since locks are stored as JSON)
function writeLockFile(mark2Dir: string, taskId: string, lock: LockInfo) {
  const lockPath = path.join(mark2Dir, 'tasks', `${taskId}.lock`);
  writeFileSync(lockPath, JSON.stringify(lock, null, 2));
}

let mark2Dir: string;
let taskService: TaskService;
let stateBranch: StateBranchService;

beforeEach(() => {
  mark2Dir = mkdtempSync(path.join(os.tmpdir(), 'mark2-locks-test-'));
  mkdirSync(path.join(mark2Dir, 'tasks'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'stories'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'activity'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'artifacts'), { recursive: true });
  initializeDatabase(mark2Dir);
  stateBranch = new StateBranchService(mark2Dir, true);
  taskService = new TaskService(mark2Dir, stateBranch, true);
});

afterEach(() => {
  closeDb();
  rmSync(mark2Dir, { recursive: true, force: true });
});

describe('Task Lock Integration', () => {
  describe('Lock acquisition on phase transition', () => {
    it('acquires lock when transitioning from pending to design', async () => {
      await taskService.create({
        title: 'Test Task',
        description: 'A task to test locking',
        created_by: 'human',
      });

      // Verify no lock exists initially
      let lock = await stateBranch.getLock('TASK-1');
      expect(lock).toBeNull();

      // Transition to design (should acquire lock)
      await taskService.transitionPhase('TASK-1', 'design');

      // Verify lock was acquired
      lock = await stateBranch.getLock('TASK-1');
      expect(lock).not.toBeNull();
      expect(lock!.locked_by).toBeDefined();
    });

    it('does NOT acquire lock when transitioning from pending to coding (only pending→design)', async () => {
      // Lock acquisition only happens on pending → design transition
      // Direct transition to coding skips design and doesn't acquire lock
      await taskService.create({
        title: 'Test Task',
        description: 'A task to test locking',
        created_by: 'human',
      });

      await taskService.transitionPhase('TASK-1', 'coding');

      const lock = await stateBranch.getLock('TASK-1');
      // No lock acquired because it wasn't pending → design
      expect(lock).toBeNull();
    });

    it('does not acquire lock when transitioning between non-pending phases', async () => {
      await taskService.create({
        title: 'Test Task',
        description: 'A task to test locking',
        created_by: 'human',
      });

      // First transition to design (acquires lock)
      await taskService.transitionPhase('TASK-1', 'design');
      const lock1 = await stateBranch.getLock('TASK-1');

      // Transition to coding (should keep same lock)
      await taskService.transitionPhase('TASK-1', 'coding');
      const lock2 = await stateBranch.getLock('TASK-1');

      expect(lock2).not.toBeNull();
      expect(lock2!.locked_at).toBe(lock1!.locked_at);
    });
  });

  describe('Lock release on phase transition', () => {
    it('releases lock when transitioning to done', async () => {
      await taskService.create({
        title: 'Test Task',
        description: 'A task to test locking',
        created_by: 'human',
      });

      // Acquire lock by transitioning to design
      await taskService.transitionPhase('TASK-1', 'design');
      let lock = await stateBranch.getLock('TASK-1');
      expect(lock).not.toBeNull();

      // Transition to done (should release lock)
      await taskService.transitionPhase('TASK-1', 'done');
      lock = await stateBranch.getLock('TASK-1');
      expect(lock).toBeNull();
    });
  });

  describe('Lock conflicts', () => {
    it('fails to transition if task is locked by another user', async () => {
      await taskService.create({
        title: 'Test Task',
        description: 'A task to test locking',
        created_by: 'human',
      });

      // Create a lock by another user
      const otherLock: LockInfo = {
        locked_by: 'Other User',
        email: 'other@example.com',
        locked_at: new Date().toISOString(),
        machine: 'other-machine',
      };
      writeLockFile(mark2Dir, 'TASK-1', otherLock);

      // Try to transition (should fail)
      await expect(taskService.transitionPhase('TASK-1', 'design')).rejects.toThrow(
        /locked by/
      );
    });

    it('allows transition if lock is owned by current user', async () => {
      await taskService.create({
        title: 'Test Task',
        description: 'A task to test locking',
        created_by: 'human',
      });

      // Acquire lock first
      await stateBranch.acquireLock('TASK-1');

      // Transition should succeed
      const task = await taskService.transitionPhase('TASK-1', 'design');
      expect(task.phase).toBe('design');
    });

    it('allows transition if lock is expired', async () => {
      await taskService.create({
        title: 'Test Task',
        description: 'A task to test locking',
        created_by: 'human',
      });

      // Create an expired lock by another user (10 days old)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      const expiredLock: LockInfo = {
        locked_by: 'Other User',
        email: 'other@example.com',
        locked_at: oldDate.toISOString(),
        machine: 'other-machine',
      };
      writeLockFile(mark2Dir, 'TASK-1', expiredLock);

      // Transition should succeed (takes expired lock)
      const task = await taskService.transitionPhase('TASK-1', 'design');
      expect(task.phase).toBe('design');

      // Lock should now be owned by current user
      const lock = await stateBranch.getLock('TASK-1');
      expect(lock).not.toBeNull();
      expect(lock!.email).not.toBe('other@example.com');
    });
  });

  describe('canPickUp', () => {
    it('returns canPickUp: true for task with no lock', async () => {
      await taskService.create({
        title: 'Test Task',
        description: 'desc',
        created_by: 'human',
      });

      const result = await taskService.canPickUp('TASK-1');
      expect(result.canPickUp).toBe(true);
    });

    it('returns canPickUp: true for task locked by current user', async () => {
      await taskService.create({
        title: 'Test Task',
        description: 'desc',
        created_by: 'human',
      });

      await stateBranch.acquireLock('TASK-1');

      const result = await taskService.canPickUp('TASK-1');
      expect(result.canPickUp).toBe(true);
      expect(result.lock).toBeDefined();
    });

    it('returns canPickUp: false for task locked by another user', async () => {
      await taskService.create({
        title: 'Test Task',
        description: 'desc',
        created_by: 'human',
      });

      const otherLock: LockInfo = {
        locked_by: 'Other User',
        email: 'other@example.com',
        locked_at: new Date().toISOString(),
        machine: 'other-machine',
      };
      writeLockFile(mark2Dir, 'TASK-1', otherLock);

      const result = await taskService.canPickUp('TASK-1');
      expect(result.canPickUp).toBe(false);
      expect(result.reason).toContain('Locked by');
    });

    it('returns canPickUp: true for task with expired lock', async () => {
      await taskService.create({
        title: 'Test Task',
        description: 'desc',
        created_by: 'human',
      });

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      const expiredLock: LockInfo = {
        locked_by: 'Other User',
        email: 'other@example.com',
        locked_at: oldDate.toISOString(),
        machine: 'other-machine',
      };
      writeLockFile(mark2Dir, 'TASK-1', expiredLock);

      const result = await taskService.canPickUp('TASK-1');
      expect(result.canPickUp).toBe(true);
      expect(result.reason).toBe('Lock expired');
    });
  });

  describe('getLock', () => {
    it('returns null for task with no lock', async () => {
      await taskService.create({
        title: 'Test Task',
        description: 'desc',
        created_by: 'human',
      });

      const lock = await taskService.getLock('TASK-1');
      expect(lock).toBeNull();
    });

    it('returns lock info for locked task', async () => {
      await taskService.create({
        title: 'Test Task',
        description: 'desc',
        created_by: 'human',
      });

      await stateBranch.acquireLock('TASK-1');
      const lock = await taskService.getLock('TASK-1');

      expect(lock).not.toBeNull();
      expect(lock!.locked_by).toBeDefined();
    });
  });

  describe('forceAcquireLock', () => {
    it('acquires lock when no lock exists', async () => {
      await taskService.create({
        title: 'Test Task',
        description: 'desc',
        created_by: 'human',
      });

      const result = await taskService.forceAcquireLock('TASK-1');
      expect(result.success).toBe(true);

      const lock = await stateBranch.getLock('TASK-1');
      expect(lock).not.toBeNull();
    });

    it('takes expired lock from another user', async () => {
      await taskService.create({
        title: 'Test Task',
        description: 'desc',
        created_by: 'human',
      });

      // Create an expired lock (10 days old)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      const expiredLock: LockInfo = {
        locked_by: 'Other User',
        email: 'other@example.com',
        locked_at: oldDate.toISOString(),
        machine: 'other-machine',
      };
      writeLockFile(mark2Dir, 'TASK-1', expiredLock);

      const result = await taskService.forceAcquireLock('TASK-1');
      expect(result.success).toBe(true);

      const lock = await stateBranch.getLock('TASK-1');
      expect(lock).not.toBeNull();
      expect(lock!.email).not.toBe('other@example.com');
    });

    it('refuses to take non-expired lock from another user', async () => {
      await taskService.create({
        title: 'Test Task',
        description: 'desc',
        created_by: 'human',
      });

      // Create a recent (non-expired) lock
      const recentLock: LockInfo = {
        locked_by: 'Other User',
        email: 'other@example.com',
        locked_at: new Date().toISOString(),
        machine: 'other-machine',
      };
      writeLockFile(mark2Dir, 'TASK-1', recentLock);

      const result = await taskService.forceAcquireLock('TASK-1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not expired');
    });

    it('acquires lock even for task without YAML (lock is independent)', async () => {
      // forceAcquireLock creates a lock file directly without checking task existence
      // Task validation happens at the service/API level separately
      const result = await taskService.forceAcquireLock('TASK-999');
      // This will succeed because we're just creating a lock file
      expect(result.success).toBe(true);
    });
  });

  describe('listWithStatusAndLocks', () => {
    it('includes lock info in task list', async () => {
      await taskService.create({
        title: 'Task 1',
        description: 'desc',
        created_by: 'human',
      });
      await taskService.create({
        title: 'Task 2',
        description: 'desc',
        created_by: 'human',
      });

      // Lock only TASK-1
      await stateBranch.acquireLock('TASK-1');

      const tasks = await taskService.listWithStatusAndLocks();

      const task1 = tasks.find((t) => t.id === 'TASK-1');
      const task2 = tasks.find((t) => t.id === 'TASK-2');

      expect(task1!.lock).toBeDefined();
      expect(task1!.lock!.locked_by).toBeDefined();
      expect(task2!.lock).toBeUndefined();
    });

    it('includes session status in task list', async () => {
      await taskService.create({
        title: 'Task 1',
        description: 'desc',
        created_by: 'human',
      });

      const tasks = await taskService.listWithStatusAndLocks();

      expect(tasks[0].session_status).toBeDefined();
      expect(['idle', 'running', 'completed', 'failed']).toContain(tasks[0].session_status);
    });
  });
});

describe('Multiple Tasks Locking', () => {
  it('allows locking multiple tasks by same user via design transition', async () => {
    await taskService.create({ title: 'Task 1', description: 'desc', created_by: 'human' });
    await taskService.create({ title: 'Task 2', description: 'desc', created_by: 'human' });

    // Only pending → design acquires lock automatically
    await taskService.transitionPhase('TASK-1', 'design');
    await taskService.transitionPhase('TASK-2', 'design');

    const lock1 = await stateBranch.getLock('TASK-1');
    const lock2 = await stateBranch.getLock('TASK-2');

    expect(lock1).not.toBeNull();
    expect(lock2).not.toBeNull();
    expect(lock1!.email).toBe(lock2!.email);
  });

  it('allows manual locking of multiple tasks', async () => {
    await taskService.create({ title: 'Task 1', description: 'desc', created_by: 'human' });
    await taskService.create({ title: 'Task 2', description: 'desc', created_by: 'human' });

    await stateBranch.acquireLock('TASK-1');
    await stateBranch.acquireLock('TASK-2');

    const lock1 = await stateBranch.getLock('TASK-1');
    const lock2 = await stateBranch.getLock('TASK-2');

    expect(lock1).not.toBeNull();
    expect(lock2).not.toBeNull();
  });

  it('lists all locks', async () => {
    await taskService.create({ title: 'Task 1', description: 'desc', created_by: 'human' });
    await taskService.create({ title: 'Task 2', description: 'desc', created_by: 'human' });

    await stateBranch.acquireLock('TASK-1');
    await stateBranch.acquireLock('TASK-2');

    const locks = await stateBranch.listLocks();
    expect(locks).toHaveLength(2);
  });
});

describe('Edge Cases', () => {
  it('canPickUp returns true for non-existent task (no lock)', async () => {
    // No lock exists, so technically it can be picked up (task validation happens elsewhere)
    const result = await taskService.canPickUp('NONEXISTENT');
    expect(result.canPickUp).toBe(true);
  });

  it('getLock returns null for non-existent task', async () => {
    const lock = await taskService.getLock('NONEXISTENT');
    expect(lock).toBeNull();
  });

  it('transitions back to pending do not release lock', async () => {
    await taskService.create({
      title: 'Test Task',
      description: 'desc',
      created_by: 'human',
    });

    // Acquire lock
    await taskService.transitionPhase('TASK-1', 'design');
    const lockBefore = await stateBranch.getLock('TASK-1');
    expect(lockBefore).not.toBeNull();

    // Go back to pending
    await taskService.transitionPhase('TASK-1', 'pending');
    const lockAfter = await stateBranch.getLock('TASK-1');

    // Lock should still exist
    expect(lockAfter).not.toBeNull();
    expect(lockAfter!.locked_at).toBe(lockBefore!.locked_at);
  });
});
