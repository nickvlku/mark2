import { test as base, expect, type APIRequestContext } from '@playwright/test';

// Tests share a dev server with mutable state — run serially to avoid flakes
base.describe.configure({ mode: 'serial' });

// ---------------------------------------------------------------------------
// Cleanup fixture – automatically deletes tasks & stories created during a test
// ---------------------------------------------------------------------------
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

    // Teardown: archive then delete tasks first (they may reference stories)
    for (const id of taskIds) {
      await request.post(`/api/tasks/${id}/archive`).catch(() => {});
      await request.delete(`/api/tasks/${id}`).catch(() => {});
    }
    for (const id of storyIds) {
      await request.delete(`/api/stories/${id}`).catch(() => {});
    }
  },
});

// ---------------------------------------------------------------------------
// Helper – find a task by title via API and return its ID (for UI-created tasks)
// ---------------------------------------------------------------------------
async function findTaskIdByTitle(
  request: APIRequestContext,
  title: string,
): Promise<string | undefined> {
  const res = await request.get('/api/tasks');
  const { tasks } = await res.json();
  const match = tasks.find((t: any) => t.title === title);
  return match?.id;
}

async function findStoryIdByTitle(
  request: APIRequestContext,
  title: string,
): Promise<string | undefined> {
  const res = await request.get('/api/stories');
  const { stories } = await res.json();
  const match = stories.find((s: any) => s.title === title);
  return match?.id;
}

// ===========================================================================
// Board View
// ===========================================================================
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

  test('can create a task via the dialog', async ({ page, cleanup }) => {
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

    // Track for cleanup (find by title since the UI doesn't expose the ID)
    const taskId = await findTaskIdByTitle(page.request, uniqueTitle);
    if (taskId) cleanup.trackTask(taskId);
  });

  test('can open create story dialog', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '+ Story' }).click();

    // Dialog should appear with form fields
    await expect(page.getByPlaceholder(/story title/i)).toBeVisible();
    await expect(page.getByPlaceholder(/describe the story/i)).toBeVisible();
  });

  test('can create a story via the dialog', async ({ page, cleanup }) => {
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

    // Track for cleanup
    const storyId = await findStoryIdByTitle(page.request, uniqueTitle);
    if (storyId) cleanup.trackStory(storyId);
  });
});

// ===========================================================================
// View Mode Toggle
// ===========================================================================
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

// ===========================================================================
// Story Grouped View
// ===========================================================================
test.describe('Story Grouped View', () => {
  test('shows unassigned section at the top', async ({ page }) => {
    await page.goto('/');

    // Switch to grouped view
    await page.getByRole('button', { name: 'By Story' }).click();

    // Unassigned should be the first section
    const sections = page.locator('[data-story-section]');
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
    const unassignedSection = page.locator('[data-story-section]').first();
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

    // Should see progress badge format (X/Y done) on at least one section
    await expect(page.getByText(/\(\d+\/\d+ done\)/).first()).toBeVisible();
  });
});

// ===========================================================================
// Story Sidebar
// ===========================================================================
test.describe('Story Sidebar', () => {
  test('clicking story section header opens story sidebar', async ({ page, cleanup }) => {
    // First create a story via API
    const storyRes = await page.request.post('/api/stories', {
      data: {
        title: 'Sidebar Test Story',
        description: 'Testing the story sidebar',
      },
    });
    expect(storyRes.ok()).toBeTruthy();
    const { story } = await storyRes.json();
    cleanup.trackStory(story.id);

    await page.goto('/');

    // Switch to grouped view
    await page.getByRole('button', { name: 'By Story' }).click();

    // Wait for the page to update
    await expect(page.getByText('Unassigned')).toBeVisible({ timeout: 5000 });

    // Find the story section header and click on the story ID badge
    const storySection = page.locator(`text=${story.id}`).first();
    await expect(storySection).toBeVisible({ timeout: 5000 });
    await storySection.click();

    // Story sidebar should open on the left with tabs
    await expect(page.getByRole('button', { name: 'Overview' })).toBeVisible({ timeout: 10000 });
  });

  test('story sidebar shows story details', async ({ page, cleanup }) => {
    // Create a story via API with unique values
    const timestamp = Date.now();
    const storyRes = await page.request.post('/api/stories', {
      data: {
        title: `Details Story ${timestamp}`,
        description: `Story description ${timestamp}`,
      },
    });
    const { story } = await storyRes.json();
    cleanup.trackStory(story.id);

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

// ===========================================================================
// Story Badge on Cards
// ===========================================================================
test.describe('Story Badge on Cards', () => {
  test('shows story badge on cards in flat view', async ({ page, cleanup }) => {
    // Create a story first
    const storyRes = await page.request.post('/api/stories', {
      data: { title: 'Badge Test Story' },
    });
    const { story } = await storyRes.json();
    cleanup.trackStory(story.id);

    // Create a task in that story with unique title
    const timestamp = Date.now();
    const taskRes = await page.request.post('/api/tasks', {
      data: {
        title: `Task with Badge ${timestamp}`,
        story_id: story.id,
      },
    });
    expect(taskRes.ok()).toBeTruthy();
    const { task } = await taskRes.json();
    cleanup.trackTask(task.id);

    await page.goto('/');

    // In flat view, look for the story badge abbreviation (S-X format)
    const shortId = story.id.replace('STORY-', 'S-');
    await expect(page.locator(`text=${shortId}`).first()).toBeVisible({ timeout: 5000 });
  });
});

// ===========================================================================
// Droppable ID Uniqueness (Bug Fix)
// ===========================================================================
test.describe('Droppable ID Uniqueness (Bug Fix)', () => {
  test('grouped view columns have unique droppable IDs across story sections', async ({ page, cleanup }) => {
    // Create two stories so we get multiple sections with duplicate phase columns
    const story1Res = await page.request.post('/api/stories', {
      data: { title: 'DnD Story A' },
    });
    const { story: story1 } = await story1Res.json();
    cleanup.trackStory(story1.id);

    const story2Res = await page.request.post('/api/stories', {
      data: { title: 'DnD Story B' },
    });
    const { story: story2 } = await story2Res.json();
    cleanup.trackStory(story2.id);

    await page.goto('/');

    // Switch to grouped view
    await page.getByRole('button', { name: 'By Story' }).click();
    await expect(page.getByText('Unassigned', { exact: true })).toBeVisible({ timeout: 5000 });

    // Wait for both story sections to appear (SWR may need to refetch)
    await expect(page.locator(`[data-story-section="${story1.id}"]`)).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`[data-story-section="${story2.id}"]`)).toBeVisible({ timeout: 10000 });

    // Verify we have at least 3 sections (unassigned + 2 stories)
    const sections = page.locator('[data-story-section]');
    const sectionCount = await sections.count();
    expect(sectionCount).toBeGreaterThanOrEqual(3);

    // Count "Pending" column headings — each section has one
    const pendingHeadings = page.getByRole('heading', { name: 'Pending', exact: true });
    const pendingCount = await pendingHeadings.count();
    expect(pendingCount).toBeGreaterThanOrEqual(3);

    // Create tasks in each story, move them to different phases via API,
    // then verify each task renders in the correct section and column.
    const timestamp = Date.now();
    const task1Res = await page.request.post('/api/tasks', {
      data: { title: `DnD Task A ${timestamp}`, story_id: story1.id },
    });
    const { task: task1 } = await task1Res.json();
    cleanup.trackTask(task1.id);

    const task2Res = await page.request.post('/api/tasks', {
      data: { title: `DnD Task B ${timestamp}`, story_id: story2.id },
    });
    const { task: task2 } = await task2Res.json();
    cleanup.trackTask(task2.id);

    // Move tasks to different phases via PATCH (not the phase transition endpoint,
    // which triggers orchestration and spawns agent sessions)
    await page.request.patch(`/api/tasks/${task1.id}`, {
      data: { phase: 'design' },
    });
    await page.request.patch(`/api/tasks/${task2.id}`, {
      data: { phase: 'done' },
    });

    // Reload and verify tasks appear in correct sections and phases
    await page.reload();
    await page.getByRole('button', { name: 'By Story' }).click();
    await expect(page.getByText('Unassigned', { exact: true })).toBeVisible({ timeout: 5000 });

    // Task A should be in story1's section (in Design column)
    const story1Section = page.locator(`[data-story-section="${story1.id}"]`);
    await expect(story1Section.getByText(`DnD Task A ${timestamp}`)).toBeVisible({ timeout: 5000 });

    // Task B should be in story2's section (in Done column)
    const story2Section = page.locator(`[data-story-section="${story2.id}"]`);
    await expect(story2Section.getByText(`DnD Task B ${timestamp}`)).toBeVisible({ timeout: 5000 });
  });
});

// ===========================================================================
// Task Detail
// ===========================================================================
test.describe('Task Detail', () => {
  test('clicking a task card opens the detail panel', async ({ page, cleanup }) => {
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
    const { task } = await response.json();
    cleanup.trackTask(task.id);

    await page.goto('/');

    // Wait for the task to appear and click the task card
    const taskCard = page.getByText(uniqueTitle).first();
    await expect(taskCard).toBeVisible({ timeout: 5000 });
    await taskCard.click();

    // The detail panel should slide in with task info
    await expect(page.getByText(uniqueDescription)).toBeVisible({ timeout: 5000 });
  });
});

// ===========================================================================
// API Routes
// ===========================================================================
test.describe('API Routes', () => {
  test('GET /api/tasks returns task list', async ({ request }) => {
    const response = await request.get('/api/tasks');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('tasks');
    expect(Array.isArray(data.tasks)).toBeTruthy();
  });

  test('POST /api/tasks creates a task with minimal fields', async ({ request, cleanup }) => {
    const response = await request.post('/api/tasks', {
      data: {
        title: 'Minimal Task',
      },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    cleanup.trackTask(data.task.id);
    expect(data.task.id).toMatch(/^TASK-\d+$/);
    expect(data.task.title).toBe('Minimal Task');
    expect(data.task.description).toBe('');
    expect(data.task.created_by).toBe('human');
    expect(data.task.priority).toBe('P2');
    expect(data.task.phase).toBe('pending');
  });

  test('POST /api/tasks creates a task with all fields', async ({ request, cleanup }) => {
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
    cleanup.trackTask(data.task.id);
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

  test('POST /api/tasks without created_by defaults to human', async ({ request, cleanup }) => {
    const response = await request.post('/api/tasks', {
      data: {
        title: 'No author task',
        description: 'Testing default created_by',
      },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    cleanup.trackTask(data.task.id);
    expect(data.task.created_by).toBe('human');
  });

  test('GET /api/tasks/:id returns created task', async ({ request, cleanup }) => {
    const createRes = await request.post('/api/tasks', {
      data: { title: 'Fetch me', description: 'Test retrieval' },
    });
    const { task } = await createRes.json();
    cleanup.trackTask(task.id);

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

  test('POST /api/stories creates a story with minimal fields', async ({ request, cleanup }) => {
    const response = await request.post('/api/stories', {
      data: {
        title: 'Minimal Story',
      },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    cleanup.trackStory(data.story.id);
    expect(data.story.id).toMatch(/^STORY-\d+$/);
    expect(data.story.title).toBe('Minimal Story');
    expect(data.story.description).toBe('');
    expect(data.story.created_by).toBe('human');
    expect(data.story.tasks).toEqual([]);
  });

  test('POST /api/stories creates a story with all fields', async ({ request, cleanup }) => {
    const response = await request.post('/api/stories', {
      data: {
        title: 'Full Story',
        description: 'With description',
        created_by: 'playwright',
      },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    cleanup.trackStory(data.story.id);
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

// ===========================================================================
// Circular Dependency Detection (Bug Fix)
// ===========================================================================
test.describe('Circular Dependency Detection (Bug Fix)', () => {
  test('API rejects transitive circular dependency A→B→C→A', async ({ request, cleanup }) => {
    // Create 3 tasks
    const res1 = await request.post('/api/tasks', { data: { title: 'Task A' } });
    const { task: taskA } = await res1.json();
    cleanup.trackTask(taskA.id);

    const res2 = await request.post('/api/tasks', { data: { title: 'Task B' } });
    const { task: taskB } = await res2.json();
    cleanup.trackTask(taskB.id);

    const res3 = await request.post('/api/tasks', { data: { title: 'Task C' } });
    const { task: taskC } = await res3.json();
    cleanup.trackTask(taskC.id);

    // Chain: A is blocked by B
    const addBRes = await request.post(`/api/tasks/${taskA.id}/blockers`, {
      data: { blocker_id: taskB.id },
    });
    expect(addBRes.ok()).toBeTruthy();

    // Chain: B is blocked by C
    const addCRes = await request.post(`/api/tasks/${taskB.id}/blockers`, {
      data: { blocker_id: taskC.id },
    });
    expect(addCRes.ok()).toBeTruthy();

    // Now try: C is blocked by A — this would create A→B→C→A cycle
    const cycleRes = await request.post(`/api/tasks/${taskC.id}/blockers`, {
      data: { blocker_id: taskA.id },
    });

    // The API should reject this circular dependency
    expect(cycleRes.ok()).toBeFalsy();
    expect(cycleRes.status()).toBe(400);
    const data = await cycleRes.json();
    expect(data.error.toLowerCase()).toContain('circular');
  });

  test('API rejects direct circular dependency A→B→A', async ({ request, cleanup }) => {
    // Create 2 tasks
    const res1 = await request.post('/api/tasks', { data: { title: 'Direct A' } });
    const { task: taskA } = await res1.json();
    cleanup.trackTask(taskA.id);

    const res2 = await request.post('/api/tasks', { data: { title: 'Direct B' } });
    const { task: taskB } = await res2.json();
    cleanup.trackTask(taskB.id);

    // A is blocked by B
    const addRes = await request.post(`/api/tasks/${taskA.id}/blockers`, {
      data: { blocker_id: taskB.id },
    });
    expect(addRes.ok()).toBeTruthy();

    // B is blocked by A — direct cycle
    const cycleRes = await request.post(`/api/tasks/${taskB.id}/blockers`, {
      data: { blocker_id: taskA.id },
    });

    expect(cycleRes.ok()).toBeFalsy();
    expect(cycleRes.status()).toBe(400);
    const data = await cycleRes.json();
    expect(data.error.toLowerCase()).toContain('circular');
  });

  test('API allows non-circular blocker chains', async ({ request, cleanup }) => {
    // Create 3 tasks
    const res1 = await request.post('/api/tasks', { data: { title: 'Chain A' } });
    const { task: taskA } = await res1.json();
    cleanup.trackTask(taskA.id);

    const res2 = await request.post('/api/tasks', { data: { title: 'Chain B' } });
    const { task: taskB } = await res2.json();
    cleanup.trackTask(taskB.id);

    const res3 = await request.post('/api/tasks', { data: { title: 'Chain C' } });
    const { task: taskC } = await res3.json();
    cleanup.trackTask(taskC.id);

    // A blocked by B, B blocked by C — this is a valid chain, not circular
    const res1b = await request.post(`/api/tasks/${taskA.id}/blockers`, {
      data: { blocker_id: taskB.id },
    });
    expect(res1b.ok()).toBeTruthy();

    const res2b = await request.post(`/api/tasks/${taskB.id}/blockers`, {
      data: { blocker_id: taskC.id },
    });
    expect(res2b.ok()).toBeTruthy();
  });
});
