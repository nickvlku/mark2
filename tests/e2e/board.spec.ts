import { test, expect } from '@playwright/test';

test.describe('Board View', () => {
  test('renders the Kanban board with phase columns', async ({ page }) => {
    await page.goto('/');

    // Verify the board loads
    await expect(page.locator('text=Mark2')).toBeVisible();

    // Verify key phase columns are present by their headings
    await expect(page.getByRole('heading', { name: 'Pending', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Design', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Coding', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Testing', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Code Review', exact: true })).toBeVisible();
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

test.describe('View Mode Toggle', () => {
  test('shows view mode toggle with Flat and By Story options', async ({ page }) => {
    await page.goto('/');

    // Check for the view mode toggle
    await expect(page.getByRole('button', { name: 'Flat' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'By Story' })).toBeVisible();
  });

  test('defaults to flat view', async ({ page }) => {
    await page.goto('/');

    // In flat view, we should see the phase columns directly
    await expect(page.getByRole('heading', { name: 'Pending', exact: true })).toBeVisible();

    // The Flat button should be active (has accent color class)
    const flatButton = page.getByRole('button', { name: 'Flat' });
    await expect(flatButton).toHaveClass(/bg-accent/);
  });

  test('can switch to grouped view', async ({ page }) => {
    await page.goto('/');

    // Click "By Story" to switch to grouped view
    await page.getByRole('button', { name: 'By Story' }).click();

    // Should see the "Unassigned" section header
    await expect(page.getByText('Unassigned')).toBeVisible();

    // The By Story button should now be active
    const byStoryButton = page.getByRole('button', { name: 'By Story' });
    await expect(byStoryButton).toHaveClass(/bg-accent/);
  });

  test('persists view mode preference', async ({ page }) => {
    await page.goto('/');

    // Switch to grouped view
    await page.getByRole('button', { name: 'By Story' }).click();
    await expect(page.getByText('Unassigned')).toBeVisible();

    // Reload the page
    await page.reload();

    // Should still be in grouped view
    await expect(page.getByText('Unassigned')).toBeVisible();
    const byStoryButton = page.getByRole('button', { name: 'By Story' });
    await expect(byStoryButton).toHaveClass(/bg-accent/);
  });
});

test.describe('Story Grouped View', () => {
  test('shows unassigned section at the top', async ({ page }) => {
    await page.goto('/');

    // Switch to grouped view
    await page.getByRole('button', { name: 'By Story' }).click();

    // Unassigned should be the first section
    const sections = page.locator('[class*="border-border rounded-xl"]');
    const firstSection = sections.first();
    await expect(firstSection.getByText('Unassigned')).toBeVisible();
  });

  test('can collapse and expand sections', async ({ page }) => {
    await page.goto('/');

    // Switch to grouped view
    await page.getByRole('button', { name: 'By Story' }).click();

    // Find the collapse toggle for Unassigned section
    const collapseButton = page.locator('[data-collapse-toggle]').first();

    // Click to collapse
    await collapseButton.click();

    // The board inside should be hidden (phase columns not visible in this section)
    // After collapse, the section's board area should be hidden
    const unassignedSection = page.locator('[class*="border-border rounded-xl"]').first();
    const pendingInSection = unassignedSection.getByRole('heading', { name: 'Pending', exact: true });
    await expect(pendingInSection).not.toBeVisible();

    // Click again to expand
    await collapseButton.click();

    // Now should be visible again
    await expect(pendingInSection).toBeVisible();
  });

  test('shows progress badge for sections', async ({ page }) => {
    await page.goto('/');

    // Switch to grouped view
    await page.getByRole('button', { name: 'By Story' }).click();

    // Should see progress badge format (X/Y done)
    await expect(page.getByText(/\(\d+\/\d+ done\)/)).toBeVisible();
  });
});

test.describe('Story Sidebar', () => {
  test('clicking story section header opens story sidebar', async ({ page }) => {
    // First create a story via API
    const storyRes = await page.request.post('/api/stories', {
      data: {
        title: 'Sidebar Test Story',
        description: 'Testing the story sidebar',
      },
    });
    expect(storyRes.ok()).toBeTruthy();
    const { story } = await storyRes.json();

    await page.goto('/');

    // Switch to grouped view
    await page.getByRole('button', { name: 'By Story' }).click();

    // Wait for the page to update
    await expect(page.getByText('Unassigned')).toBeVisible({ timeout: 5000 });

    // Find the story section header and click on the story ID badge
    // The story ID badge is a clickable element in the section header
    const storySection = page.locator(`text=${story.id}`).first();
    await expect(storySection).toBeVisible({ timeout: 5000 });
    await storySection.click();

    // Story sidebar should open on the left with tabs
    await expect(page.getByRole('button', { name: 'Overview' })).toBeVisible({ timeout: 10000 });
  });

  test('story sidebar shows story details', async ({ page }) => {
    // Create a story via API with unique values
    const timestamp = Date.now();
    const storyRes = await page.request.post('/api/stories', {
      data: {
        title: `Details Story ${timestamp}`,
        description: `Story description ${timestamp}`,
      },
    });
    const { story } = await storyRes.json();

    await page.goto('/');
    await page.getByRole('button', { name: 'By Story' }).click();
    await expect(page.getByText('Unassigned')).toBeVisible({ timeout: 5000 });

    // Click the story section
    const storyBadge = page.locator(`text=${story.id}`).first();
    await expect(storyBadge).toBeVisible({ timeout: 5000 });
    await storyBadge.click();

    // Should show the story details in the sidebar (use first() to avoid strict mode violation)
    await expect(page.getByText(`Details Story ${timestamp}`).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(`Story description ${timestamp}`).first()).toBeVisible();
  });
});

test.describe('Story Badge on Cards', () => {
  test('shows story badge on cards in flat view', async ({ page }) => {
    // Create a story first
    const storyRes = await page.request.post('/api/stories', {
      data: { title: 'Badge Test Story' },
    });
    const { story } = await storyRes.json();

    // Create a task in that story with unique title
    const timestamp = Date.now();
    const taskRes = await page.request.post('/api/tasks', {
      data: {
        title: `Task with Badge ${timestamp}`,
        story_id: story.id,
      },
    });
    expect(taskRes.ok()).toBeTruthy();

    await page.goto('/');

    // In flat view, look for the story badge abbreviation (S-X format)
    // The badge should be visible somewhere on the page
    const shortId = story.id.replace('STORY-', 'S-');
    await expect(page.locator(`text=${shortId}`).first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Task Detail', () => {
  test('clicking a task card opens the detail panel', async ({ page }) => {
    // Generate a unique task title and description to avoid conflicts
    const timestamp = Date.now();
    const uniqueTitle = `Detail Panel Test ${timestamp}`;
    const uniqueDescription = `Testing the detail panel ${timestamp}`;

    // First create a task via API
    const response = await page.request.post('/api/tasks', {
      data: {
        title: uniqueTitle,
        description: uniqueDescription,
      },
    });
    expect(response.ok()).toBeTruthy();

    await page.goto('/');

    // Wait for the task to appear and click the task card
    const taskCard = page.getByText(uniqueTitle).first();
    await expect(taskCard).toBeVisible({ timeout: 5000 });
    await taskCard.click();

    // The detail panel should slide in with task info
    // Check for the unique description which proves the panel opened with the right task
    await expect(page.getByText(uniqueDescription)).toBeVisible({ timeout: 5000 });
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
