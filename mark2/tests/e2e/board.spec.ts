import { test, expect } from '@playwright/test';

test.describe('Board View', () => {
  test('renders the Kanban board with 7 phase columns', async ({ page }) => {
    await page.goto('/');

    // Verify the board loads
    await expect(page.locator('text=Mark2')).toBeVisible();

    // Verify all 7 phase columns are present by their headings
    await expect(page.getByRole('heading', { name: 'Pending', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Design', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Coding', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Testing', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Code Review', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Manual Testing', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Done', exact: true })).toBeVisible();
  });

  test('shows create task button', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: '+ Task' })).toBeVisible();
  });

  test('shows create story button', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: '+ Story' })).toBeVisible();
  });

  test('can open create task dialog', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '+ Task' }).click();

    // Dialog should appear with form fields
    await expect(page.getByPlaceholder(/task title/i)).toBeVisible();
    await expect(page.getByPlaceholder(/describe the task/i)).toBeVisible();
  });

  test('can create a task via the dialog', async ({ page }) => {
    const uniqueTitle = `Test Task from Playwright ${Date.now()}`;
    
    await page.goto('/');
    await page.getByRole('button', { name: '+ Task' }).click();

    // Fill in the form
    await page.getByPlaceholder(/task title/i).fill(uniqueTitle);
    await page.getByPlaceholder(/describe the task/i).fill('This is an e2e test task');

    // Submit
    await page.getByRole('button', { name: /create task/i }).click();

    // Task should appear on the board in the pending column
    await expect(page.getByText(uniqueTitle)).toBeVisible({ timeout: 10000 });
  });

  test('can open create story dialog', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '+ Story' }).click();

    // Dialog should appear with form fields
    await expect(page.getByPlaceholder(/story title/i)).toBeVisible();
    await expect(page.getByPlaceholder(/describe the story/i)).toBeVisible();
  });

  test('can create a story via the dialog', async ({ page }) => {
    const uniqueTitle = `Test Story from Playwright ${Date.now()}`;
    
    await page.goto('/');
    await page.getByRole('button', { name: '+ Story' }).click();

    // Fill in the form
    await page.getByPlaceholder(/story title/i).fill(uniqueTitle);
    await page.getByPlaceholder(/describe the story/i).fill('An e2e test story');

    // Submit
    await page.getByRole('button', { name: /create story/i }).click();

    // Dialog should close (story doesn't appear as a card, so verify dialog is gone)
    await expect(page.getByPlaceholder(/story title/i)).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe('Task Detail', () => {
  test('clicking a task card opens the detail panel', async ({ page }) => {
    // Generate a unique task title to avoid conflicts
    const uniqueTitle = `Detail Panel Test ${Date.now()}`;
    
    // First create a task via API
    const response = await page.request.post('/api/tasks', {
      data: {
        title: uniqueTitle,
        description: 'Testing the detail panel',
      },
    });
    expect(response.ok()).toBeTruthy();

    await page.goto('/');

    // Wait for the task to appear and click the task card specifically
    await page.getByRole('button', { name: new RegExp(uniqueTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();

    // The detail panel should slide in with task info
    // Check for the detail panel specifically (it should contain both title and description)
    const detailPanel = page.locator('[data-testid="task-detail-panel"], .task-detail, .detail-panel').first();
    if (await detailPanel.count() > 0) {
      await expect(detailPanel.getByText(uniqueTitle)).toBeVisible();
      await expect(detailPanel.getByText('Testing the detail panel')).toBeVisible();
    } else {
      // Fallback: check for any element containing the description, which should be unique
      await expect(page.getByText('Testing the detail panel')).toBeVisible();
      await expect(page.locator('h2').filter({ hasText: uniqueTitle })).toBeVisible();
    }
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
