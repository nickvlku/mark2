import path from 'path';
import fs from 'fs';
import { StateBranchService } from '../../src/lib/services/state-branch-service';

export async function lockCommand(
  taskId: string,
  projectDir: string = process.cwd()
): Promise<void> {
  const mark2Dir = path.join(projectDir, '.mark2');

  if (!fs.existsSync(mark2Dir)) {
    console.error('Error: .mark2 not found. Run `mark2 init` first.');
    process.exit(1);
  }

  if (!taskId) {
    console.error('Error: Task ID is required.');
    console.log('Usage: mark2 lock <task-id>');
    process.exit(1);
  }

  // Validate task ID format
  if (!/^TASK-\d+$/.test(taskId)) {
    console.error(`Error: Invalid task ID format: ${taskId}`);
    console.log('Expected format: TASK-N (e.g., TASK-1, TASK-42)');
    process.exit(1);
  }

  const stateBranch = new StateBranchService(mark2Dir);

  console.log(`Acquiring lock on ${taskId}...`);

  try {
    const result = await stateBranch.acquireLock(taskId);

    if (result.success) {
      console.log(`  Lock acquired successfully.`);
      console.log(`  Locked by: ${result.lock?.locked_by}`);
      console.log(`  Locked at: ${new Date(result.lock?.locked_at ?? '').toLocaleString()}`);
    } else {
      if (result.existingLock) {
        console.error(`  Error: Task is already locked.`);
        console.log(`  Locked by: ${result.existingLock.locked_by} (${result.existingLock.email})`);
        console.log(`  Locked at: ${new Date(result.existingLock.locked_at).toLocaleString()}`);
        console.log(`  Machine: ${result.existingLock.machine}`);

        const isExpired = await stateBranch.isLockExpired(result.existingLock);
        if (isExpired) {
          console.log('\n  This lock has expired. You can force acquire it with:');
          console.log(`    mark2 lock ${taskId} --force`);
        }
      } else {
        console.error(`  Error: ${result.error}`);
      }
      process.exit(1);
    }
  } catch (e: any) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

export async function unlockCommand(
  taskId: string,
  projectDir: string = process.cwd()
): Promise<void> {
  const mark2Dir = path.join(projectDir, '.mark2');

  if (!fs.existsSync(mark2Dir)) {
    console.error('Error: .mark2 not found. Run `mark2 init` first.');
    process.exit(1);
  }

  if (!taskId) {
    console.error('Error: Task ID is required.');
    console.log('Usage: mark2 unlock <task-id>');
    process.exit(1);
  }

  // Validate task ID format
  if (!/^TASK-\d+$/.test(taskId)) {
    console.error(`Error: Invalid task ID format: ${taskId}`);
    console.log('Expected format: TASK-N (e.g., TASK-1, TASK-42)');
    process.exit(1);
  }

  const stateBranch = new StateBranchService(mark2Dir);

  console.log(`Releasing lock on ${taskId}...`);

  try {
    const lock = await stateBranch.getLock(taskId);

    if (!lock) {
      console.log(`  No lock found on ${taskId}.`);
      return;
    }

    const isMine = await stateBranch.isLockMine(lock);
    if (!isMine) {
      console.error(`  Error: This lock belongs to ${lock.locked_by} (${lock.email}).`);
      console.log('  You can only release your own locks.');
      process.exit(1);
    }

    await stateBranch.releaseLock(taskId);
    console.log(`  Lock released successfully.`);
  } catch (e: any) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

export async function locksCommand(
  projectDir: string = process.cwd()
): Promise<void> {
  const mark2Dir = path.join(projectDir, '.mark2');

  if (!fs.existsSync(mark2Dir)) {
    console.error('Error: .mark2 not found. Run `mark2 init` first.');
    process.exit(1);
  }

  const stateBranch = new StateBranchService(mark2Dir);

  console.log('Current locks:');

  try {
    // Pull latest first
    await stateBranch.pull();

    const locks = await stateBranch.listLocks();

    if (locks.size === 0) {
      console.log('  No tasks are currently locked.');
      return;
    }

    const { email: currentEmail } = stateBranch.getUserIdentity();

    for (const [taskId, lock] of locks) {
      const isExpired = await stateBranch.isLockExpired(lock);
      const isMine = lock.email === currentEmail;
      const lockDate = new Date(lock.locked_at);

      let status = '';
      if (isMine) {
        status = ' (you)';
      } else if (isExpired) {
        status = ' (EXPIRED)';
      }

      console.log(`\n  ${taskId}${status}`);
      console.log(`    Locked by: ${lock.locked_by} <${lock.email}>`);
      console.log(`    Since: ${lockDate.toLocaleString()}`);
      console.log(`    Machine: ${lock.machine}`);
    }

    console.log('');
  } catch (e: any) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

export async function forceLockCommand(
  taskId: string,
  projectDir: string = process.cwd()
): Promise<void> {
  const mark2Dir = path.join(projectDir, '.mark2');

  if (!fs.existsSync(mark2Dir)) {
    console.error('Error: .mark2 not found. Run `mark2 init` first.');
    process.exit(1);
  }

  if (!taskId) {
    console.error('Error: Task ID is required.');
    console.log('Usage: mark2 lock <task-id> --force');
    process.exit(1);
  }

  const stateBranch = new StateBranchService(mark2Dir);

  console.log(`Force acquiring lock on ${taskId}...`);

  try {
    const existingLock = await stateBranch.getLock(taskId);

    if (!existingLock) {
      // No existing lock, just acquire normally
      const result = await stateBranch.acquireLock(taskId);
      if (result.success) {
        console.log(`  Lock acquired successfully.`);
      } else {
        console.error(`  Error: ${result.error}`);
        process.exit(1);
      }
      return;
    }

    const isExpired = await stateBranch.isLockExpired(existingLock);
    if (!isExpired) {
      console.error(`  Error: Cannot force acquire a lock that hasn't expired.`);
      console.log(`  Current lock held by: ${existingLock.locked_by}`);
      console.log(`  Locked at: ${new Date(existingLock.locked_at).toLocaleString()}`);
      process.exit(1);
    }

    const result = await stateBranch.forceTakeLock(taskId);
    if (result.success) {
      console.log(`  Lock force-acquired successfully.`);
      console.log(`  Previous owner: ${existingLock.locked_by}`);
    } else {
      console.error(`  Error: ${result.error}`);
      process.exit(1);
    }
  } catch (e: any) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}
