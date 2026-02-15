import { test as base, expect } from '@playwright/test';

base.describe.configure({ mode: 'serial' });

const test = base.extend<{
  cleanup: {
    trackTask: (id: string) => void;
    trackStory: (id: string) => void;
  };
}>({
  cleanup: async ({ request }, use) => {
    const taskIds: string[] = [];
    const storyIds: string[] = [];

    await use({
      trackTask: (id: string) => taskIds.push(id),
      trackStory: (id: string) => storyIds.push(id),
    });

    for (const id of taskIds) {
      await request.post(`/api/tasks/${id}/archive`).catch(() => {});
      await request.delete(`/api/tasks/${id}`).catch(() => {});
    }
    for (const id of storyIds) {
      await request.delete(`/api/stories/${id}`).catch(() => {});
    }
  },
});

test.describe('Story Run', () => {
  test('starts a story and kicks off unblocked tasks', async ({ page, request, cleanup }) => {
    const storyTitle = `Story Run ${Date.now()}`;

    const storyRes = await request.post('/api/stories', {
      data: {
        title: storyTitle,
        description: 'Story run e2e',
      },
    });
    expect(storyRes.ok()).toBeTruthy();
    const storyBody = await storyRes.json();
    const storyId = storyBody.story.id as string;
    cleanup.trackStory(storyId);

    const taskARes = await request.post('/api/tasks', {
      data: {
        title: `Task A ${Date.now()}`,
        description: 'A',
        story_id: storyId,
      },
    });
    const taskABody = await taskARes.json();
    const taskAId = taskABody.task.id as string;
    cleanup.trackTask(taskAId);

    const taskBRes = await request.post('/api/tasks', {
      data: {
        title: `Task B ${Date.now()}`,
        description: 'B',
        story_id: storyId,
      },
    });
    const taskBBody = await taskBRes.json();
    const taskBId = taskBBody.task.id as string;
    cleanup.trackTask(taskBId);

    await request.post(`/api/stories/${storyId}/tasks`, { data: { task_id: taskAId } });
    await request.post(`/api/stories/${storyId}/tasks`, { data: { task_id: taskBId } });
    await request.post(`/api/tasks/${taskBId}/blockers`, { data: { blocker_id: taskAId } });

    await page.goto('/');
    await page.getByRole('button', { name: 'By Story' }).click();
    await page.getByText(storyTitle).first().click();

    await expect(page.getByRole('button', { name: 'Start Story' })).toBeVisible();
    const startStoryResponse = page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url().includes(`/api/stories/${storyId}/run/start`),
    );
    await page.getByRole('button', { name: 'Start Story' }).click();
    const startResponse = await startStoryResponse;
    expect(startResponse.ok()).toBeTruthy();

    await expect.poll(async () => {
      const res = await request.get(`/api/tasks/${taskAId}`);
      const body = await res.json();
      return body.task.phase;
    }, { timeout: 15000 }).toBe('design');

    await expect.poll(async () => {
      const res = await request.get(`/api/tasks/${taskBId}`);
      const body = await res.json();
      return body.task.phase;
    }).toBe('pending');
  });
});
