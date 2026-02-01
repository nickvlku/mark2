import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Use vi.hoisted() to ensure mocks are defined before vi.mock() runs
const {
  mockGetLock,
  mockIsLockExpired,
  mockIsLockMine,
  mockAcquireLock,
  mockReleaseLock,
  mockForceTakeLock,
  mockGetById,
  mockForceAcquireLock,
} = vi.hoisted(() => ({
  mockGetLock: vi.fn(),
  mockIsLockExpired: vi.fn(),
  mockIsLockMine: vi.fn(),
  mockAcquireLock: vi.fn(),
  mockReleaseLock: vi.fn(),
  mockForceTakeLock: vi.fn(),
  mockGetById: vi.fn(),
  mockForceAcquireLock: vi.fn(),
}));

vi.mock('@/lib/services/factory', () => ({
  createTaskService: () => ({
    getById: mockGetById,
    forceAcquireLock: mockForceAcquireLock,
  }),
  createStateBranchService: () => ({
    getLock: mockGetLock,
    isLockExpired: mockIsLockExpired,
    isLockMine: mockIsLockMine,
    acquireLock: mockAcquireLock,
    releaseLock: mockReleaseLock,
    forceTakeLock: mockForceTakeLock,
  }),
}));

// Import after mocks are set up
import { GET, POST, DELETE } from '@/app/api/tasks/[id]/lock/route';

describe('Lock API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: task exists
    mockGetById.mockReturnValue({
      id: 'TASK-1',
      title: 'Test Task',
      phase: 'pending',
    });
  });

  describe('GET /api/tasks/:id/lock', () => {
    it('returns locked: false when no lock exists', async () => {
      mockGetLock.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/tasks/TASK-1/lock');
      const response = await GET(request, { params: Promise.resolve({ id: 'TASK-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.locked).toBe(false);
    });

    it('returns lock info when lock exists', async () => {
      const lock = {
        locked_by: 'Test User',
        email: 'test@example.com',
        locked_at: '2025-01-15T10:00:00Z',
        machine: 'test-machine',
      };
      mockGetLock.mockResolvedValue(lock);
      mockIsLockExpired.mockResolvedValue(false);
      mockIsLockMine.mockResolvedValue(true);

      const request = new NextRequest('http://localhost/api/tasks/TASK-1/lock');
      const response = await GET(request, { params: Promise.resolve({ id: 'TASK-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.locked).toBe(true);
      expect(data.lock).toEqual(lock);
      expect(data.is_expired).toBe(false);
      expect(data.is_mine).toBe(true);
    });

    it('returns 404 for non-existent task', async () => {
      mockGetById.mockReturnValue(null);

      const request = new NextRequest('http://localhost/api/tasks/TASK-999/lock');
      const response = await GET(request, { params: Promise.resolve({ id: 'TASK-999' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });

    it('returns 400 for invalid task ID', async () => {
      const request = new NextRequest('http://localhost/api/tasks/invalid/lock');
      const response = await GET(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid task ID');
    });
  });

  describe('POST /api/tasks/:id/lock', () => {
    it('acquires lock successfully', async () => {
      const lock = {
        locked_by: 'Test User',
        email: 'test@example.com',
        locked_at: '2025-01-15T10:00:00Z',
        machine: 'test-machine',
      };
      mockAcquireLock.mockResolvedValue({ success: true, lock });

      const request = new NextRequest('http://localhost/api/tasks/TASK-1/lock', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const response = await POST(request, { params: Promise.resolve({ id: 'TASK-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.lock).toEqual(lock);
    });

    it('returns 409 when lock acquisition fails', async () => {
      const existingLock = {
        locked_by: 'Other User',
        email: 'other@example.com',
        locked_at: '2025-01-15T10:00:00Z',
        machine: 'other-machine',
      };
      mockAcquireLock.mockResolvedValue({
        success: false,
        error: 'Task is locked by Other User',
        existingLock,
      });

      const request = new NextRequest('http://localhost/api/tasks/TASK-1/lock', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const response = await POST(request, { params: Promise.resolve({ id: 'TASK-1' }) });
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toContain('locked');
      expect(data.existing_lock).toEqual(existingLock);
    });

    it('force acquires lock when force=true', async () => {
      mockForceAcquireLock.mockResolvedValue({ success: true });

      const request = new NextRequest('http://localhost/api/tasks/TASK-1/lock', {
        method: 'POST',
        body: JSON.stringify({ force: true }),
      });
      const response = await POST(request, { params: Promise.resolve({ id: 'TASK-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockForceAcquireLock).toHaveBeenCalledWith('TASK-1');
    });

    it('returns 409 when force acquire fails', async () => {
      mockForceAcquireLock.mockResolvedValue({
        success: false,
        error: 'Cannot force acquire',
      });

      const request = new NextRequest('http://localhost/api/tasks/TASK-1/lock', {
        method: 'POST',
        body: JSON.stringify({ force: true }),
      });
      const response = await POST(request, { params: Promise.resolve({ id: 'TASK-1' }) });
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe('Cannot force acquire');
    });

    it('returns 404 for non-existent task', async () => {
      mockGetById.mockReturnValue(null);

      const request = new NextRequest('http://localhost/api/tasks/TASK-999/lock', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const response = await POST(request, { params: Promise.resolve({ id: 'TASK-999' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });

    it('handles missing request body', async () => {
      const lock = {
        locked_by: 'Test User',
        email: 'test@example.com',
        locked_at: '2025-01-15T10:00:00Z',
        machine: 'test-machine',
      };
      mockAcquireLock.mockResolvedValue({ success: true, lock });

      // Create request without body
      const request = new NextRequest('http://localhost/api/tasks/TASK-1/lock', {
        method: 'POST',
      });
      const response = await POST(request, { params: Promise.resolve({ id: 'TASK-1' }) });

      expect(response.status).toBe(200);
    });
  });

  describe('DELETE /api/tasks/:id/lock', () => {
    it('releases lock successfully when owned by current user', async () => {
      const lock = {
        locked_by: 'Test User',
        email: 'test@example.com',
        locked_at: '2025-01-15T10:00:00Z',
        machine: 'test-machine',
      };
      mockGetLock.mockResolvedValue(lock);
      mockIsLockMine.mockResolvedValue(true);
      mockReleaseLock.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost/api/tasks/TASK-1/lock', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'TASK-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockReleaseLock).toHaveBeenCalledWith('TASK-1');
    });

    it('returns 403 when trying to release lock owned by another user', async () => {
      const lock = {
        locked_by: 'Other User',
        email: 'other@example.com',
        locked_at: '2025-01-15T10:00:00Z',
        machine: 'other-machine',
      };
      mockGetLock.mockResolvedValue(lock);
      mockIsLockMine.mockResolvedValue(false);

      const request = new NextRequest('http://localhost/api/tasks/TASK-1/lock', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'TASK-1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('another user');
      expect(mockReleaseLock).not.toHaveBeenCalled();
    });

    it('succeeds when no lock exists', async () => {
      mockGetLock.mockResolvedValue(null);
      mockReleaseLock.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost/api/tasks/TASK-1/lock', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'TASK-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('returns 404 for non-existent task', async () => {
      mockGetById.mockReturnValue(null);

      const request = new NextRequest('http://localhost/api/tasks/TASK-999/lock', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'TASK-999' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });
  });
});

describe('Lock API Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetById.mockReturnValue({
      id: 'TASK-1',
      title: 'Test Task',
      phase: 'pending',
    });
  });

  it('handles internal errors in GET', async () => {
    mockGetLock.mockRejectedValue(new Error('Database error'));

    const request = new NextRequest('http://localhost/api/tasks/TASK-1/lock');
    const response = await GET(request, { params: Promise.resolve({ id: 'TASK-1' }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Database error');
  });

  it('handles internal errors in POST', async () => {
    mockAcquireLock.mockRejectedValue(new Error('Lock service error'));

    const request = new NextRequest('http://localhost/api/tasks/TASK-1/lock', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'TASK-1' }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Lock service error');
  });

  it('handles internal errors in DELETE', async () => {
    mockGetLock.mockRejectedValue(new Error('Release error'));

    const request = new NextRequest('http://localhost/api/tasks/TASK-1/lock', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'TASK-1' }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Release error');
  });
});
