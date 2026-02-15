import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/lib/yaml/schemas';

const mockGetDb = vi.hoisted(() => vi.fn());
const mockRemoveWorktree = vi.hoisted(() => vi.fn());
const mockGetBranchName = vi.hoisted(() => vi.fn());
const mockMergeTaskIntoStory = vi.hoisted(() => vi.fn());
const mockStoryGetById = vi.hoisted(() => vi.fn());
const mockTaskGetBlocking = vi.hoisted(() => vi.fn());
const mockTaskRemoveBlocker = vi.hoisted(() => vi.fn());
const mockStartReadyTasks = vi.hoisted(() => vi.fn());
const mockRefreshReadyToMergeStatus = vi.hoisted(() => vi.fn());
const mockMarkTaskMergeFailure = vi.hoisted(() => vi.fn());
const mockClearTaskMergeFailure = vi.hoisted(() => vi.fn());
const mockCreatePR = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  getDb: mockGetDb,
}));

vi.mock('@/lib/utils/git', () => ({
  removeWorktree: mockRemoveWorktree,
}));

vi.mock('@/lib/services/clone-service', () => ({
  CloneService: class {
    getBranchName = mockGetBranchName;
    mergeTaskIntoStory = mockMergeTaskIntoStory;
  },
}));

vi.mock('@/lib/services/story-service', () => ({
  StoryService: class {
    getById = mockStoryGetById;
  },
}));

vi.mock('@/lib/services/task-service', () => ({
  TaskService: class {
    getBlocking = mockTaskGetBlocking;
    removeBlocker = mockTaskRemoveBlocker;
  },
}));

vi.mock('@/lib/services/story-run-service', () => ({
  StoryRunService: class {
    startReadyTasks = mockStartReadyTasks;
    refreshReadyToMergeStatus = mockRefreshReadyToMergeStatus;
    markTaskMergeFailure = mockMarkTaskMergeFailure;
    clearTaskMergeFailure = mockClearTaskMergeFailure;
  },
}));

vi.mock('@/lib/services/pr-service', () => ({
  PRService: class {
    createPR = mockCreatePR;
  },
}));

import { handleDone } from '@/lib/orchestration/phase-handlers/done';

function buildTask(overrides: Partial<Task> = {}): Task {
  const now = '2026-02-09T00:00:00.000Z';
  return {
    id: 'TASK-1',
    title: 'Task',
    description: 'desc',
    phase: 'done',
    phase_agents: {},
    phase_overrides: {},
    blockers: [],
    priority: 'P2',
    artifacts: [],
    ports: [],
    worktrees: {},
    created_by: 'human',
    story_id: 'STORY-1',
    merge_strategy: 'squash',
    auto_advance: true,
    auto_approve: false,
    created_at: now,
    updated_at: now,
    phase_entered_at: now,
    loop_count: 0,
    archived: false,
    ...overrides,
  };
}

describe('handleDone story merge gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const run = vi.fn();
    const values = vi.fn(() => ({ run }));
    const where = vi.fn(() => ({ run }));
    const set = vi.fn(() => ({ where }));
    mockGetDb.mockReturnValue({
      insert: vi.fn(() => ({ values })),
      update: vi.fn(() => ({ set })),
      delete: vi.fn(() => ({ where })),
    });

    mockGetBranchName.mockReturnValue('mark2/TASK-1');
    mockRemoveWorktree.mockResolvedValue(undefined);
    mockStoryGetById.mockReturnValue({
      id: 'STORY-1',
      execution: {
        status: 'running',
        branch_name: 'mark2/story-1',
        base_branch: 'main',
        target_branch: 'main',
        task_merge_failures: [],
      },
    });
    mockTaskGetBlocking.mockReturnValue([]);
    mockTaskRemoveBlocker.mockResolvedValue(undefined);
    mockStartReadyTasks.mockResolvedValue({
      ready_task_ids: [],
      started_task_ids: [],
      failed: [],
    });
    mockRefreshReadyToMergeStatus.mockResolvedValue({});
    mockMarkTaskMergeFailure.mockResolvedValue(undefined);
    mockClearTaskMergeFailure.mockResolvedValue(undefined);
    mockCreatePR.mockResolvedValue({
      success: false,
      error: 'PR disabled in test',
    });
  });

  it('does not refresh ready_to_merge when task->story merge fails', async () => {
    mockMergeTaskIntoStory.mockResolvedValue({
      success: false,
      error: 'Merge conflicts detected',
    });

    await handleDone(buildTask(), '/tmp/project', '/tmp/project/.mark2');

    expect(mockStartReadyTasks).toHaveBeenCalledWith('STORY-1');
    expect(mockMarkTaskMergeFailure).toHaveBeenCalledWith('STORY-1', 'TASK-1', 'Merge conflicts detected');
    expect(mockClearTaskMergeFailure).not.toHaveBeenCalled();
    expect(mockRefreshReadyToMergeStatus).not.toHaveBeenCalled();
  });

  it('refreshes ready_to_merge when task->story merge succeeds', async () => {
    mockMergeTaskIntoStory.mockResolvedValue({
      success: true,
      sha: 'abc123',
    });

    await handleDone(buildTask(), '/tmp/project', '/tmp/project/.mark2');

    expect(mockClearTaskMergeFailure).toHaveBeenCalledWith('STORY-1', 'TASK-1');
    expect(mockMarkTaskMergeFailure).not.toHaveBeenCalled();
    expect(mockRefreshReadyToMergeStatus).toHaveBeenCalledWith('STORY-1');
    expect(mockCreatePR).not.toHaveBeenCalled();
  });
});
