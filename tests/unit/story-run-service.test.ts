import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StoryRunService } from '@/lib/services/story-run-service';
import type { Story, Task } from '@/lib/yaml/schemas';

const NOW = '2026-02-09T00:00:00.000Z';

function makeStory(overrides: Partial<Story> = {}): Story {
  return {
    id: 'STORY-1',
    title: 'Story',
    description: 'Story description',
    tasks: ['TASK-1', 'TASK-2'],
    execution: {
      status: 'running',
      branch_name: 'mark2/story-1',
      base_branch: 'main',
      target_branch: 'main',
      started_at: NOW,
    },
    created_by: 'human',
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeTask(id: string, phase: Task['phase'] = 'pending'): Task {
  return {
    id,
    title: id,
    description: id,
    phase,
    phase_agents: {},
    phase_overrides: {},
    blockers: [],
    priority: 'P2',
    artifacts: [],
    ports: [],
    worktrees: {},
    created_by: 'human',
    merge_strategy: 'squash',
    auto_advance: true,
    auto_approve: false,
    story_id: 'STORY-1',
    created_at: NOW,
    updated_at: NOW,
    phase_entered_at: NOW,
    loop_count: 0,
    archived: false,
  };
}

describe('StoryRunService', () => {
  let storyService: {
    getById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let taskService: {
    list: ReturnType<typeof vi.fn>;
    allBlockersResolved: ReturnType<typeof vi.fn>;
    getSessionStatus: ReturnType<typeof vi.fn>;
    transitionPhase: ReturnType<typeof vi.fn>;
  };
  let startPhaseFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storyService = {
      getById: vi.fn(),
      update: vi.fn(),
    };
    taskService = {
      list: vi.fn(),
      allBlockersResolved: vi.fn(),
      getSessionStatus: vi.fn(),
      transitionPhase: vi.fn(),
    };
    startPhaseFn = vi.fn().mockResolvedValue(undefined);
  });

  it('starts all ready pending tasks in parallel story mode', async () => {
    storyService.getById.mockReturnValue(makeStory());
    taskService.list.mockReturnValue([
      makeTask('TASK-1', 'pending'),
      makeTask('TASK-2', 'pending'),
      makeTask('TASK-3', 'design'),
    ]);
    taskService.allBlockersResolved.mockImplementation((taskId: string) => taskId === 'TASK-1');
    taskService.getSessionStatus.mockResolvedValue('idle');
    taskService.transitionPhase.mockResolvedValue(undefined);

    const service = new StoryRunService('/tmp/mark2', {
      storyService: storyService as any,
      taskService: taskService as any,
      startPhaseFn,
    });

    const result = await service.startReadyTasks('STORY-1');

    expect(result.ready_task_ids).toEqual(['TASK-1']);
    expect(result.started_task_ids).toEqual(['TASK-1']);
    expect(taskService.transitionPhase).toHaveBeenCalledWith('TASK-1', 'design');
    expect(startPhaseFn).toHaveBeenCalledWith('TASK-1', 'design');
  });

  it('does not start tasks when story is idle', async () => {
    storyService.getById.mockReturnValue(makeStory({
      execution: {
        status: 'idle',
        base_branch: 'main',
        target_branch: 'main',
      },
    }));

    const service = new StoryRunService('/tmp/mark2', {
      storyService: storyService as any,
      taskService: taskService as any,
      startPhaseFn,
    });

    const result = await service.startReadyTasks('STORY-1');
    expect(result.started_task_ids).toEqual([]);
    expect(taskService.transitionPhase).not.toHaveBeenCalled();
    expect(startPhaseFn).not.toHaveBeenCalled();
  });

  it('marks running stories as ready_to_merge when all tasks are done', async () => {
    const story = makeStory();
    storyService.getById.mockReturnValue(story);
    storyService.update.mockImplementation(async (_id: string, updates: Partial<Story>) => ({
      ...story,
      ...updates,
    }));
    taskService.list.mockReturnValue([
      makeTask('TASK-1', 'done'),
      makeTask('TASK-2', 'done'),
    ]);

    const service = new StoryRunService('/tmp/mark2', {
      storyService: storyService as any,
      taskService: taskService as any,
      startPhaseFn,
    });

    await service.refreshReadyToMergeStatus('STORY-1');

    expect(storyService.update).toHaveBeenCalledTimes(1);
    const [, updates] = storyService.update.mock.calls[0];
    expect(updates.execution.status).toBe('ready_to_merge');
  });
});

