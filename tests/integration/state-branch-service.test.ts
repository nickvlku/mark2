import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';
import { StateBranchService, LockInfo } from '@/lib/services/state-branch-service';

// Helper to write lock files as JSON (not YAML, since locks are stored as JSON)
function writeLockFile(mark2Dir: string, taskId: string, lock: LockInfo) {
  const lockPath = path.join(mark2Dir, 'tasks', `${taskId}.lock`);
  writeFileSync(lockPath, JSON.stringify(lock, null, 2));
}

let mark2Dir: string;
let stateBranch: StateBranchService;

beforeEach(() => {
  mark2Dir = mkdtempSync(path.join(os.tmpdir(), 'mark2-state-test-'));
  mkdirSync(path.join(mark2Dir, 'tasks'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'stories'), { recursive: true });
  // Use localOnly mode for testing (no git operations)
  stateBranch = new StateBranchService(mark2Dir, true);
});

afterEach(() => {
  rmSync(mark2Dir, { recursive: true, force: true });
});

describe('StateBranchService', () => {
  describe('localOnly mode', () => {
    it('writes directly to mark2Dir in localOnly mode', async () => {
      await stateBranch.writeYaml('tasks/TASK-1.yaml', {
        id: 'TASK-1',
        title: 'Test Task',
      });

      const filePath = path.join(mark2Dir, 'tasks', 'TASK-1.yaml');
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, 'utf-8');
      const parsed = YAML.parse(content);
      expect(parsed.id).toBe('TASK-1');
      expect(parsed.title).toBe('Test Task');
    });

    it('reads from mark2Dir in localOnly mode', async () => {
      await stateBranch.writeYaml('tasks/TASK-1.yaml', {
        id: 'TASK-1',
        title: 'Test Task',
        phase: 'pending',
      });

      const data = await stateBranch.readYaml('tasks/TASK-1.yaml');
      expect(data).not.toBeNull();
      expect(data.id).toBe('TASK-1');
      expect(data.title).toBe('Test Task');
    });

    it('returns null for non-existent file', async () => {
      const data = await stateBranch.readYaml('tasks/NONEXISTENT.yaml');
      expect(data).toBeNull();
    });

    it('pull is a no-op in localOnly mode', async () => {
      const result = await stateBranch.pull();
      expect(result.success).toBe(true);
      expect(result.message).toBe('Local-only mode');
    });

    it('push is a no-op in localOnly mode', async () => {
      // Should not throw
      await stateBranch.push('Test commit');
    });

    it('ensureWorktree creates directory in localOnly mode', async () => {
      const newMark2Dir = mkdtempSync(path.join(os.tmpdir(), 'mark2-state-new-'));
      const newStateBranch = new StateBranchService(newMark2Dir, true);

      await newStateBranch.ensureWorktree();

      expect(existsSync(newMark2Dir)).toBe(true);
      rmSync(newMark2Dir, { recursive: true, force: true });
    });
  });

  describe('writeYaml', () => {
    it('creates parent directories if they do not exist', async () => {
      await stateBranch.writeYaml('nested/deep/file.yaml', { key: 'value' });

      const filePath = path.join(mark2Dir, 'nested', 'deep', 'file.yaml');
      expect(existsSync(filePath)).toBe(true);
    });

    it('overwrites existing files', async () => {
      await stateBranch.writeYaml('tasks/TASK-1.yaml', { version: 1 });
      await stateBranch.writeYaml('tasks/TASK-1.yaml', { version: 2 });

      const data = await stateBranch.readYaml('tasks/TASK-1.yaml');
      expect(data.version).toBe(2);
    });

    it('handles complex nested objects', async () => {
      const complexData = {
        id: 'TASK-1',
        phase_agents: {
          coding: 'coder-agent',
          testing: 'test-agent',
        },
        blockers: ['TASK-2', 'TASK-3'],
        metadata: {
          nested: {
            deeply: {
              value: 42,
            },
          },
        },
      };

      await stateBranch.writeYaml('tasks/TASK-1.yaml', complexData);
      const data = await stateBranch.readYaml('tasks/TASK-1.yaml');

      expect(data.phase_agents.coding).toBe('coder-agent');
      expect(data.blockers).toEqual(['TASK-2', 'TASK-3']);
      expect(data.metadata.nested.deeply.value).toBe(42);
    });
  });

  describe('deleteFile', () => {
    it('deletes an existing file', async () => {
      await stateBranch.writeYaml('tasks/TASK-1.yaml', { id: 'TASK-1' });
      const filePath = path.join(mark2Dir, 'tasks', 'TASK-1.yaml');
      expect(existsSync(filePath)).toBe(true);

      await stateBranch.deleteFile('tasks/TASK-1.yaml');
      expect(existsSync(filePath)).toBe(false);
    });

    it('does not throw for non-existent file', async () => {
      // Should not throw
      await stateBranch.deleteFile('tasks/NONEXISTENT.yaml');
    });
  });

  describe('listFiles', () => {
    it('lists files matching a pattern', async () => {
      await stateBranch.writeYaml('tasks/TASK-1.yaml', { id: 'TASK-1' });
      await stateBranch.writeYaml('tasks/TASK-2.yaml', { id: 'TASK-2' });
      await stateBranch.writeYaml('tasks/TASK-1.activity.yaml', { task_id: 'TASK-1' });

      const taskFiles = await stateBranch.listFiles('tasks', /\.yaml$/);
      expect(taskFiles).toContain('TASK-1.yaml');
      expect(taskFiles).toContain('TASK-2.yaml');
      expect(taskFiles).toContain('TASK-1.activity.yaml');
    });

    it('returns empty array for empty directory', async () => {
      const files = await stateBranch.listFiles('stories', /\.yaml$/);
      expect(files).toEqual([]);
    });

    it('returns empty array for non-existent directory', async () => {
      const files = await stateBranch.listFiles('nonexistent', /\.yaml$/);
      expect(files).toEqual([]);
    });
  });

  describe('Lock Operations', () => {
    describe('acquireLock', () => {
      it('creates a lock file when no lock exists', async () => {
        const result = await stateBranch.acquireLock('TASK-1');

        expect(result.success).toBe(true);
        expect(result.lock).toBeDefined();
        expect(result.lock!.locked_by).toBeDefined();
        expect(result.lock!.email).toBeDefined();
        expect(result.lock!.locked_at).toBeDefined();
        expect(result.lock!.machine).toBeDefined();

        // Verify lock file exists
        const lockPath = path.join(mark2Dir, 'tasks', 'TASK-1.lock');
        expect(existsSync(lockPath)).toBe(true);
      });

      it('returns existing lock if already owned by current user', async () => {
        // Acquire lock first time
        const result1 = await stateBranch.acquireLock('TASK-1');
        expect(result1.success).toBe(true);

        // Acquire same lock again
        const result2 = await stateBranch.acquireLock('TASK-1');
        expect(result2.success).toBe(true);
        expect(result2.lock!.locked_at).toBe(result1.lock!.locked_at);
      });

      it('fails if lock is owned by another user', async () => {
        // Manually create a lock by another user (as JSON, since locks are stored as JSON)
        const otherLock: LockInfo = {
          locked_by: 'Other User',
          email: 'other@example.com',
          locked_at: new Date().toISOString(),
          machine: 'other-machine',
        };
        writeLockFile(mark2Dir, 'TASK-1', otherLock);

        const result = await stateBranch.acquireLock('TASK-1');

        expect(result.success).toBe(false);
        expect(result.error).toContain('locked by');
        expect(result.existingLock).toBeDefined();
        expect(result.existingLock!.email).toBe('other@example.com');
      });
    });

    describe('getLock', () => {
      it('returns null when no lock exists', async () => {
        const lock = await stateBranch.getLock('TASK-1');
        expect(lock).toBeNull();
      });

      it('returns lock info when lock exists', async () => {
        await stateBranch.acquireLock('TASK-1');
        const lock = await stateBranch.getLock('TASK-1');

        expect(lock).not.toBeNull();
        expect(lock!.locked_by).toBeDefined();
        expect(lock!.email).toBeDefined();
      });
    });

    describe('releaseLock', () => {
      it('removes the lock file', async () => {
        await stateBranch.acquireLock('TASK-1');
        const lockPath = path.join(mark2Dir, 'tasks', 'TASK-1.lock');
        expect(existsSync(lockPath)).toBe(true);

        await stateBranch.releaseLock('TASK-1');
        expect(existsSync(lockPath)).toBe(false);
      });

      it('does not throw when no lock exists', async () => {
        // Should not throw
        await stateBranch.releaseLock('TASK-1');
      });
    });

    describe('isLockExpired', () => {
      it('returns false for recent lock', async () => {
        const lock: LockInfo = {
          locked_by: 'Test User',
          email: 'test@example.com',
          locked_at: new Date().toISOString(),
          machine: 'test-machine',
        };

        const expired = await stateBranch.isLockExpired(lock);
        expect(expired).toBe(false);
      });

      it('returns true for old lock', async () => {
        // Create a lock from 10 days ago (default timeout is 5 days)
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 10);

        const lock: LockInfo = {
          locked_by: 'Test User',
          email: 'test@example.com',
          locked_at: oldDate.toISOString(),
          machine: 'test-machine',
        };

        const expired = await stateBranch.isLockExpired(lock);
        expect(expired).toBe(true);
      });
    });

    describe('isLockMine', () => {
      it('returns true for lock owned by current user', async () => {
        const result = await stateBranch.acquireLock('TASK-1');
        const isMine = await stateBranch.isLockMine(result.lock!);
        expect(isMine).toBe(true);
      });

      it('returns false for lock owned by another user', async () => {
        const otherLock: LockInfo = {
          locked_by: 'Other User',
          email: 'other@example.com',
          locked_at: new Date().toISOString(),
          machine: 'other-machine',
        };

        const isMine = await stateBranch.isLockMine(otherLock);
        expect(isMine).toBe(false);
      });
    });

    describe('forceTakeLock', () => {
      it('takes lock from another user', async () => {
        // Create lock by another user (as JSON)
        const otherLock: LockInfo = {
          locked_by: 'Other User',
          email: 'other@example.com',
          locked_at: new Date().toISOString(),
          machine: 'other-machine',
        };
        writeLockFile(mark2Dir, 'TASK-1', otherLock);

        await stateBranch.forceTakeLock('TASK-1');

        const lock = await stateBranch.getLock('TASK-1');
        expect(lock).not.toBeNull();
        expect(lock!.email).not.toBe('other@example.com');
      });

      it('creates lock if none exists', async () => {
        await stateBranch.forceTakeLock('TASK-1');

        const lock = await stateBranch.getLock('TASK-1');
        expect(lock).not.toBeNull();
      });
    });

    describe('listLocks', () => {
      it('returns empty Map when no locks exist', async () => {
        const locks = await stateBranch.listLocks();
        expect(locks.size).toBe(0);
      });

      it('returns all locks as a Map', async () => {
        await stateBranch.acquireLock('TASK-1');
        await stateBranch.acquireLock('TASK-2');

        const locks = await stateBranch.listLocks();
        expect(locks.size).toBe(2);
        expect(locks.has('TASK-1')).toBe(true);
        expect(locks.has('TASK-2')).toBe(true);
      });

      it('includes lock info for each lock', async () => {
        await stateBranch.acquireLock('TASK-1');

        const locks = await stateBranch.listLocks();
        const lock = locks.get('TASK-1');
        expect(lock).toBeDefined();
        expect(lock!.locked_by).toBeDefined();
        expect(lock!.email).toBeDefined();
      });
    });
  });

  describe('getUserIdentity', () => {
    it('returns user identity with name, email, and machine', () => {
      const identity = stateBranch.getUserIdentity();

      expect(identity.name).toBeDefined();
      expect(identity.email).toBeDefined();
      expect(identity.machine).toBeDefined();
      // Machine should be the hostname
      expect(identity.machine).toBe(os.hostname());
    });
  });
});
