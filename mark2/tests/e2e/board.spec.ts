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
    await expect(page.getByPlaceholder(/title/i)).toBeVisible();
    await expect(page.getByPlaceholder(/description/i)).toBeVisible();
  });

  test('can create a task via the dialog', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /add task/i }).click();

    // Fill in the form
    await page.getByPlaceholder(/title/i).fill('Test Task from Playwright');
    await page.getByPlaceholder(/description/i).fill('This is an e2e test task');

    // Submit
    await page.getByRole('button', { name: /create/i }).click();

    // Task should appear on the board in the pending column
    await expect(page.getByText('Test Task from Playwright')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Task Detail', () => {
  test('clicking a task card opens the detail panel', async ({ page }) => {
    // First create a task via API
    const response = await page.request.post('/api/tasks', {
      data: {
        title: 'Detail Panel Test',
        description: 'Testing the detail panel',
        created_by: 'playwright',
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

  test('POST /api/tasks creates a task', async ({ request }) => {
    const response = await request.post('/api/tasks', {
      data: {
        title: 'API Test Task',
        description: 'Created via API test',
        created_by: 'playwright',
        priority: 'P1',
      },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.task.id).toMatch(/^TASK-\d+$/);
    expect(data.task.title).toBe('API Test Task');
    expect(data.task.priority).toBe('P1');
  });

  test('GET /api/stories returns story list', async ({ request }) => {
    const response = await request.get('/api/stories');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('stories');
  });

  test('GET /api/config returns config', async ({ request }) => {
    const response = await request.get('/api/config');
    expect(response.ok()).toBeTruthy();
  });

  test('GET /api/health returns health status', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
  });
});
