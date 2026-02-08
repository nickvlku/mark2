import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';

// Use vi.hoisted() to ensure mocks are defined before vi.mock() runs
const {
  mockAcquireLock,
  mockReleaseLock,
  mockGetLock,
  mockListLocks,
  mockForceTakeLock,
  mockIsLockExpired,
  mockIsLockMine,
  mockPull,
  mockGetUserIdentity,
  mockEnsureWorktree,
  mockPush,
  mockFullReindex,
} = vi.hoisted(() => ({
  mockAcquireLock: vi.fn(),
  mockReleaseLock: vi.fn(),
  mockGetLock: vi.fn(),
  mockListLocks: vi.fn(),
  mockForceTakeLock: vi.fn(),
  mockIsLockExpired: vi.fn(),
  mockIsLockMine: vi.fn(),
  mockPull: vi.fn(),
  mockGetUserIdentity: vi.fn(),
  mockEnsureWorktree: vi.fn(),
  mockPush: vi.fn(),
  mockFullReindex: vi.fn(),
}));

// Mock StateBranchService
vi.mock('../../src/lib/services/state-branch-service', () => ({
  StateBranchService: class MockStateBranchService {
    acquireLock = mockAcquireLock;
    releaseLock = mockReleaseLock;
    getLock = mockGetLock;
    listLocks = mockListLocks;
    forceTakeLock = mockForceTakeLock;
    isLockExpired = mockIsLockExpired;
    isLockMine = mockIsLockMine;
    pull = mockPull;
    push = mockPush;
    ensureWorktree = mockEnsureWorktree;
    getUserIdentity = mockGetUserIdentity;
  },
}));

// Mock ReindexService
vi.mock('../../src/lib/services/reindex-service', () => ({
  ReindexService: class MockReindexService {
    fullReindex = mockFullReindex;
  },
}));

// Mock database initialization
vi.mock('../../src/lib/db', () => ({
  initializeDatabase: vi.fn(),
}));

// Mock console.log/error to capture output
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

// Mock process.exit to prevent actual exit
const mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
  throw new Error(`process.exit called with code ${code}`);
});

describe('CLI Sync Command', () => {
  let projectDir: string;
  let mark2Dir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(path.join(os.tmpdir(), 'mark2-cli-sync-'));
    mark2Dir = path.join(projectDir, '.mark2');
    mkdirSync(mark2Dir, { recursive: true });

    vi.clearAllMocks();
    mockPull.mockResolvedValue({ success: true, updated: false, message: 'Already up to date' });
    mockEnsureWorktree.mockResolvedValue(undefined);
    mockPush.mockResolvedValue(undefined);
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  describe('syncCommand', () => {
    it('performs pull and reindex for default sync', async () => {
      mockFullReindex.mockResolvedValue({
        tasks_indexed: 5,
        stories_indexed: 2,
        activities_indexed: 10,
        errors: [],
        sync_result: { success: true, updated: true, message: 'Updated from remote' },
      });

      const { syncCommand } = await import('../../cli/commands/sync');
      await syncCommand(projectDir, { push: false });

      expect(mockFullReindex).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Syncing state'));
    });

    it('handles sync errors gracefully', async () => {
      mockFullReindex.mockRejectedValue(new Error('Sync failed'));

      const { syncCommand } = await import('../../cli/commands/sync');

      await expect(syncCommand(projectDir, { push: false })).rejects.toThrow('process.exit called');
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Sync failed'));
    });

    it('reports sync result status', async () => {
      mockFullReindex.mockResolvedValue({
        tasks_indexed: 3,
        stories_indexed: 1,
        activities_indexed: 5,
        errors: [],
        sync_result: { success: true, updated: false, message: 'Already up to date' },
      });

      const { syncCommand } = await import('../../cli/commands/sync');
      await syncCommand(projectDir, { push: false });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Already up to date'));
    });

    it('performs push when push option is true', async () => {
      const { syncCommand } = await import('../../cli/commands/sync');
      await syncCommand(projectDir, { push: true });

      expect(mockEnsureWorktree).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('Manual sync push');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Push complete'));
    });
  });
});

describe('CLI Lock Commands', () => {
  let projectDir: string;
  let mark2Dir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(path.join(os.tmpdir(), 'mark2-cli-lock-'));
    mark2Dir = path.join(projectDir, '.mark2');
    mkdirSync(mark2Dir, { recursive: true });

    vi.clearAllMocks();
    mockPull.mockResolvedValue({ success: true, updated: false, message: 'Already up to date' });
    mockGetUserIdentity.mockReturnValue({
      name: 'Test User',
      email: 'test@example.com',
      machine: 'test-machine',
    });
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  describe('lockCommand', () => {
    it('acquires lock for a task', async () => {
      mockAcquireLock.mockResolvedValue({
        success: true,
        lock: {
          locked_by: 'Test User',
          email: 'test@example.com',
          locked_at: '2025-01-15T10:00:00Z',
          machine: 'test-machine',
        },
      });

      const { lockCommand } = await import('../../cli/commands/lock');
      await lockCommand('TASK-1', projectDir);

      expect(mockAcquireLock).toHaveBeenCalledWith('TASK-1');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Lock acquired'));
    });

    it('reports when lock acquisition fails', async () => {
      mockAcquireLock.mockResolvedValue({
        success: false,
        error: 'Task is locked by Other User',
        existingLock: {
          locked_by: 'Other User',
          email: 'other@example.com',
          locked_at: '2025-01-15T10:00:00Z',
          machine: 'other-machine',
        },
      });
      mockIsLockExpired.mockResolvedValue(false);

      const { lockCommand } = await import('../../cli/commands/lock');

      await expect(lockCommand('TASK-1', projectDir)).rejects.toThrow('process.exit called');
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('already locked'));
    });

    it('validates task ID format', async () => {
      const { lockCommand } = await import('../../cli/commands/lock');

      await expect(lockCommand('invalid', projectDir)).rejects.toThrow('process.exit called');
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Invalid task ID'));
    });

    it('requires task ID argument', async () => {
      const { lockCommand } = await import('../../cli/commands/lock');

      await expect(lockCommand('', projectDir)).rejects.toThrow('process.exit called');
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Task ID is required'));
    });
  });

  describe('forceLockCommand', () => {
    it('force acquires lock when existing lock is expired', async () => {
      mockGetLock.mockResolvedValue({
        locked_by: 'Other User',
        email: 'other@example.com',
        locked_at: '2024-01-01T10:00:00Z',
        machine: 'other-machine',
      });
      mockIsLockExpired.mockResolvedValue(true);
      mockForceTakeLock.mockResolvedValue({ success: true });

      const { forceLockCommand } = await import('../../cli/commands/lock');
      await forceLockCommand('TASK-1', projectDir);

      expect(mockForceTakeLock).toHaveBeenCalledWith('TASK-1');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('force-acquired'));
    });

    it('acquires normal lock when no existing lock', async () => {
      mockGetLock.mockResolvedValue(null);
      mockAcquireLock.mockResolvedValue({ success: true });

      const { forceLockCommand } = await import('../../cli/commands/lock');
      await forceLockCommand('TASK-1', projectDir);

      expect(mockAcquireLock).toHaveBeenCalledWith('TASK-1');
    });

    it('refuses to force acquire non-expired lock', async () => {
      mockGetLock.mockResolvedValue({
        locked_by: 'Other User',
        email: 'other@example.com',
        locked_at: new Date().toISOString(),
        machine: 'other-machine',
      });
      mockIsLockExpired.mockResolvedValue(false);

      const { forceLockCommand } = await import('../../cli/commands/lock');

      await expect(forceLockCommand('TASK-1', projectDir)).rejects.toThrow('process.exit called');
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("hasn't expired")
      );
    });
  });

  describe('unlockCommand', () => {
    it('releases lock for a task when owned', async () => {
      mockGetLock.mockResolvedValue({
        locked_by: 'Test User',
        email: 'test@example.com',
        locked_at: '2025-01-15T10:00:00Z',
        machine: 'test-machine',
      });
      mockIsLockMine.mockResolvedValue(true);
      mockReleaseLock.mockResolvedValue(undefined);

      const { unlockCommand } = await import('../../cli/commands/lock');
      await unlockCommand('TASK-1', projectDir);

      expect(mockReleaseLock).toHaveBeenCalledWith('TASK-1');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('released'));
    });

    it('reports when unlock fails due to ownership', async () => {
      mockGetLock.mockResolvedValue({
        locked_by: 'Other User',
        email: 'other@example.com',
        locked_at: '2025-01-15T10:00:00Z',
        machine: 'other-machine',
      });
      mockIsLockMine.mockResolvedValue(false);

      const { unlockCommand } = await import('../../cli/commands/lock');

      await expect(unlockCommand('TASK-1', projectDir)).rejects.toThrow('process.exit called');
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('belongs to'));
    });

    it('succeeds when no lock exists', async () => {
      mockGetLock.mockResolvedValue(null);

      const { unlockCommand } = await import('../../cli/commands/lock');
      await unlockCommand('TASK-1', projectDir);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('No lock found'));
    });
  });

  describe('locksCommand', () => {
    it('lists all current locks', async () => {
      const locks = new Map([
        [
          'TASK-1',
          {
            locked_by: 'User A',
            email: 'a@example.com',
            locked_at: '2025-01-15T10:00:00Z',
            machine: 'machine-a',
          },
        ],
        [
          'TASK-2',
          {
            locked_by: 'User B',
            email: 'b@example.com',
            locked_at: '2025-01-14T10:00:00Z',
            machine: 'machine-b',
          },
        ],
      ]);
      mockListLocks.mockResolvedValue(locks);
      mockIsLockExpired.mockResolvedValue(false);

      const { locksCommand } = await import('../../cli/commands/lock');
      await locksCommand(projectDir);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('TASK-1'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('TASK-2'));
    });

    it('reports when no locks exist', async () => {
      mockListLocks.mockResolvedValue(new Map());

      const { locksCommand } = await import('../../cli/commands/lock');
      await locksCommand(projectDir);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('No tasks are currently locked'));
    });

    it('marks locks as expired', async () => {
      const locks = new Map([
        [
          'TASK-1',
          {
            locked_by: 'User A',
            email: 'a@example.com',
            locked_at: '2024-01-01T10:00:00Z',
            machine: 'machine-a',
          },
        ],
      ]);
      mockListLocks.mockResolvedValue(locks);
      mockIsLockExpired.mockResolvedValue(true);

      const { locksCommand } = await import('../../cli/commands/lock');
      await locksCommand(projectDir);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('EXPIRED'));
    });
  });
});

describe('CLI Directory Validation', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(path.join(os.tmpdir(), 'mark2-cli-validation-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('sync fails when .mark2 directory does not exist', async () => {
    const { syncCommand } = await import('../../cli/commands/sync');

    await expect(syncCommand(projectDir, { push: false })).rejects.toThrow('process.exit called');
    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('.mark2 not found'));
  });

  it('lock fails when .mark2 directory does not exist', async () => {
    const { lockCommand } = await import('../../cli/commands/lock');

    await expect(lockCommand('TASK-1', projectDir)).rejects.toThrow('process.exit called');
    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('.mark2 not found'));
  });
});
