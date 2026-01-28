import { test, expect } from '@playwright/test';

test.describe('Board View', () => {
  test('renders the Kanban board with 7 phase columns', async ({ page }) => {
    await page.goto('/');

    // Verify the board loads
    await expect(page.locator('text=Mark2')).toBeVisible();

    // Verify all 7 phase columns are present
    const phases = ['pending', 'design', 'coding', 'testing', 'code_review', 'manual_testing', 'done'];
    for (const phase of phases) {
      await expect(page.getByText(phase.replace('_', ' '), { exact: false })).toBeVisible();
    }
  });

  test('shows create task button', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /add task/i })).toBeVisible();
  });

  test('shows create story button', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /add story/i })).toBeVisible();
  });

  test('can open create task dialog', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /add task/i }).click();

    // Dialog should appear with form fields
    await expect(page.getByPlaceholder(/task title/i)).toBeVisible();
    await expect(page.getByPlaceholder(/describe the task/i)).toBeVisible();
  });

  test('can create a task via the dialog', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /add task/i }).click();

    // Fill in the form
    await page.getByPlaceholder(/task title/i).fill('Test Task from Playwright');
    await page.getByPlaceholder(/describe the task/i).fill('This is an e2e test task');

    // Submit
    await page.getByRole('button', { name: /create task/i }).click();

    // Task should appear on the board in the pending column
    await expect(page.getByText('Test Task from Playwright')).toBeVisible({ timeout: 10000 });
  });

  test('can open create story dialog', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /add story/i }).click();

    // Dialog should appear with form fields
    await expect(page.getByPlaceholder(/story title/i)).toBeVisible();
    await expect(page.getByPlaceholder(/describe the story/i)).toBeVisible();
  });

  test('can create a story via the dialog', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /add story/i }).click();

    // Fill in the form
    await page.getByPlaceholder(/story title/i).fill('Test Story from Playwright');
    await page.getByPlaceholder(/describe the story/i).fill('An e2e test story');

    // Submit
    await page.getByRole('button', { name: /create story/i }).click();

    // Dialog should close (story doesn't appear as a card, so verify dialog is gone)
    await expect(page.getByPlaceholder(/story title/i)).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe('Task Detail', () => {
  test('clicking a task card opens the detail panel', async ({ page }) => {
    // First create a task via API
    const response = await page.request.post('/api/tasks', {
      data: {
        title: 'Detail Panel Test',
        description: 'Testing the detail panel',
      },
    });
    expect(response.ok()).toBeTruthy();

    await page.goto('/');

    // Wait for the task to appear and click it
    await page.getByText('Detail Panel Test').click();

    // The detail panel should slide in with task info
    await expect(page.getByText('Detail Panel Test')).toBeVisible();
    await expect(page.getByText('Testing the detail panel')).toBeVisible();
  });
});

test.describe('API Routes', () => {
  test('GET /api/tasks returns task list', async ({ request }) => {
    const response = await request.get('/api/tasks');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('tasks');
    expect(Array.isArray(data.tasks)).toBeTruthy();
  });

  test('POST /api/tasks creates a task with minimal fields', async ({ request }) => {
    const response = await request.post('/api/tasks', {
      data: {
        title: 'Minimal Task',
      },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.task.id).toMatch(/^TASK-\d+$/);
    expect(data.task.title).toBe('Minimal Task');
    expect(data.task.description).toBe('');
    expect(data.task.created_by).toBe('human');
    expect(data.task.priority).toBe('P2');
    expect(data.task.phase).toBe('pending');
  });

  test('POST /api/tasks creates a task with all fields', async ({ request }) => {
    const response = await request.post('/api/tasks', {
      data: {
        title: 'Full Task',
        description: 'Created via API test',
        created_by: 'playwright',
        priority: 'P1',
      },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.task.title).toBe('Full Task');
    expect(data.task.description).toBe('Created via API test');
    expect(data.task.created_by).toBe('playwright');
    expect(data.task.priority).toBe('P1');
  });

  test('POST /api/tasks rejects missing title', async ({ request }) => {
    const response = await request.post('/api/tasks', {
      data: {
        description: 'No title provided',
      },
    });
    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('title');
  });

  test('POST /api/tasks without created_by defaults to human', async ({ request }) => {
    const response = await request.post('/api/tasks', {
      data: {
        title: 'No author task',
        description: 'Testing default created_by',
      },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.task.created_by).toBe('human');
  });

  test('GET /api/tasks/:id returns created task', async ({ request }) => {
    const createRes = await request.post('/api/tasks', {
      data: { title: 'Fetch me', description: 'Test retrieval' },
    });
    const { task } = await createRes.json();

    const getRes = await request.get(`/api/tasks/${task.id}`);
    expect(getRes.ok()).toBeTruthy();
    const data = await getRes.json();
    expect(data.task.title).toBe('Fetch me');
  });

  test('GET /api/stories returns story list', async ({ request }) => {
    const response = await request.get('/api/stories');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('stories');
  });

  test('POST /api/stories creates a story with minimal fields', async ({ request }) => {
    const response = await request.post('/api/stories', {
      data: {
        title: 'Minimal Story',
      },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.story.id).toMatch(/^STORY-\d+$/);
    expect(data.story.title).toBe('Minimal Story');
    expect(data.story.description).toBe('');
    expect(data.story.created_by).toBe('human');
    expect(data.story.tasks).toEqual([]);
  });

  test('POST /api/stories creates a story with all fields', async ({ request }) => {
    const response = await request.post('/api/stories', {
      data: {
        title: 'Full Story',
        description: 'With description',
        created_by: 'playwright',
      },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.story.title).toBe('Full Story');
    expect(data.story.description).toBe('With description');
    expect(data.story.created_by).toBe('playwright');
  });

  test('POST /api/stories rejects missing title', async ({ request }) => {
    const response = await request.post('/api/stories', {
      data: {
        description: 'No title',
      },
    });
    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('title');
  });

  test('GET /api/health returns health status', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
  });
});
