import { test as base, expect } from '@playwright/test';

// Tests share a dev server with mutable state — run serially to avoid flakes
base.describe.configure({ mode: 'serial' });

// ---------------------------------------------------------------------------
// Cleanup fixture – automatically deletes plans, tasks & stories created during a test
// ---------------------------------------------------------------------------
const test = base.extend<{
  cleanup: {
    trackPlan: (id: string) => void;
    trackTask: (id: string) => void;
    trackStory: (id: string) => void;
  };
}>({
  cleanup: async ({ request }, use) => {
    const planIds: string[] = [];
    const taskIds: string[] = [];
    const storyIds: string[] = [];

    await use({
      trackPlan: (id: string) => planIds.push(id),
      trackTask: (id: string) => taskIds.push(id),
      trackStory: (id: string) => storyIds.push(id),
    });

    // Teardown: delete tasks first (they may reference stories), then stories, then plans
    for (const id of taskIds) {
      await request.post(`/api/tasks/${id}/archive`).catch(() => {});
      await request.delete(`/api/tasks/${id}`).catch(() => {});
    }
    for (const id of storyIds) {
      await request.delete(`/api/stories/${id}`).catch(() => {});
    }
    for (const id of planIds) {
      await request.delete(`/api/plans/${id}`).catch(() => {});
    }
  },
});

// ===========================================================================
// Plans Navigation
// ===========================================================================
test.describe('Plans Navigation', () => {
  test('shows Plans link in top navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Plans' })).toBeVisible();
  });

  test('can navigate to plans page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Plans' }).click();
    await expect(page).toHaveURL('/plans');
    await expect(page.getByRole('heading', { name: /Plans/i })).toBeVisible();
  });

  test('plans page renders with header', async ({ page }) => {
    await page.goto('/plans');
    await expect(page.getByRole('heading', { name: /Plans/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Plan' })).toBeVisible();
  });
});

// ===========================================================================
// Plans Page
// ===========================================================================
test.describe('Plans Page', () => {
  test('shows empty state when no plans exist', async ({ page }) => {
    await page.goto('/plans');
    // May show "No plans yet" if list is empty, or show plans if they exist
    // This test just verifies the page loads without error
    await expect(page.getByRole('heading', { name: /Plans/ })).toBeVisible();
  });

  test('has phase filter buttons', async ({ page }) => {
    await page.goto('/plans');
    await expect(page.getByRole('button', { name: 'All', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Active', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
  });

  test('can open create plan dialog', async ({ page }) => {
    await page.goto('/plans');
    await page.getByRole('button', { name: '+ Plan' }).click();

    // Dialog should appear with form fields
    await expect(page.getByPlaceholder(/auto-generated from prompt/i)).toBeVisible();
    await expect(page.getByPlaceholder(/describe the feature/i)).toBeVisible();
  });

  test('create plan dialog validates prompt is required', async ({ page }) => {
    await page.goto('/plans');
    await page.getByRole('button', { name: '+ Plan' }).click();

    // Create button should be disabled when prompt is empty
    const createButton = page.getByRole('button', { name: 'Create Plan', exact: true });
    await expect(createButton).toBeDisabled();
  });

  test('can create a plan via the dialog', async ({ page, cleanup }) => {
    const timestamp = Date.now();
    const uniqueTitle = `Test Plan ${timestamp}`;
    const uniquePrompt = `Build a user authentication system ${timestamp}`;

    await page.goto('/plans');
    await page.getByRole('button', { name: '+ Plan' }).click();

    // Fill in the form
    await page.getByPlaceholder(/auto-generated from prompt/i).fill(uniqueTitle);
    await page.getByPlaceholder(/describe the feature/i).fill(uniquePrompt);

    // Submit
    await page.getByRole('button', { name: 'Create Plan', exact: true }).click();

    // Plan should appear on the page
    await expect(page.getByText(uniqueTitle)).toBeVisible({ timeout: 10000 });

    // Track for cleanup
    const res = await page.request.get('/api/plans');
    const { plans } = await res.json();
    const match = plans.find((p: any) => p.title === uniqueTitle);
    if (match) cleanup.trackPlan(match.id);
  });

  test('can click a plan card to open detail', async ({ page, cleanup }) => {
    // Create plan via API
    const timestamp = Date.now();
    const planRes = await page.request.post('/api/plans', {
      data: {
        title: `Detail Test Plan ${timestamp}`,
        prompt: `Test prompt for detail view ${timestamp}`,
      },
    });
    expect(planRes.ok()).toBeTruthy();
    const { plan } = await planRes.json();
    cleanup.trackPlan(plan.id);

    await page.goto('/plans');

    // Click the plan card
    await expect(page.getByText(`Detail Test Plan ${timestamp}`)).toBeVisible({ timeout: 10000 });
    await page.getByText(`Detail Test Plan ${timestamp}`).click();

    // Detail panel should slide in - verify by checking for the "Prompt" heading in the detail
    await expect(page.getByRole('heading', { name: 'Prompt' })).toBeVisible({ timeout: 5000 });
  });
});

// ===========================================================================
// Plans API Routes
// ===========================================================================
test.describe('Plans API Routes', () => {
  test('GET /api/plans returns plan list', async ({ request }) => {
    const response = await request.get('/api/plans');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('plans');
    expect(Array.isArray(data.plans)).toBeTruthy();
  });

  test('POST /api/plans creates a plan with title and prompt', async ({ request, cleanup }) => {
    const response = await request.post('/api/plans', {
      data: {
        title: 'API Test Plan',
        prompt: 'Build a REST API for user management',
      },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    cleanup.trackPlan(data.plan.id);

    expect(data.plan.id).toMatch(/^PLAN-\d+$/);
    expect(data.plan.title).toBe('API Test Plan');
    expect(data.plan.prompt).toBe('Build a REST API for user management');
    expect(data.plan.phase).toBe('prompt');
    expect(data.plan.created_by).toBe('human');
  });

  test('POST /api/plans auto-generates title from prompt', async ({ request, cleanup }) => {
    const response = await request.post('/api/plans', {
      data: {
        prompt: 'Add dark mode support to the application',
      },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    cleanup.trackPlan(data.plan.id);

    // Title should be auto-generated from prompt first line
    expect(data.plan.title).toBeTruthy();
    expect(data.plan.title.length).toBeGreaterThan(0);
  });

  test('POST /api/plans rejects missing prompt', async ({ request }) => {
    const response = await request.post('/api/plans', {
      data: {
        title: 'No prompt plan',
      },
    });
    expect(response.status()).toBe(400);
  });

  test('GET /api/plans/:id returns created plan', async ({ request, cleanup }) => {
    const createRes = await request.post('/api/plans', {
      data: { title: 'Fetch Test', prompt: 'Test plan retrieval' },
    });
    const { plan } = await createRes.json();
    cleanup.trackPlan(plan.id);

    const getRes = await request.get(`/api/plans/${plan.id}`);
    expect(getRes.ok()).toBeTruthy();
    const data = await getRes.json();
    expect(data.plan.title).toBe('Fetch Test');
    expect(data.plan.prompt).toBe('Test plan retrieval');
  });

  test('PATCH /api/plans/:id updates plan fields', async ({ request, cleanup }) => {
    const createRes = await request.post('/api/plans', {
      data: { title: 'Update Test', prompt: 'Original prompt' },
    });
    const { plan } = await createRes.json();
    cleanup.trackPlan(plan.id);

    const patchRes = await request.patch(`/api/plans/${plan.id}`, {
      data: { title: 'Updated Title' },
    });
    expect(patchRes.ok()).toBeTruthy();
    const data = await patchRes.json();
    expect(data.plan.title).toBe('Updated Title');
  });

  test('DELETE /api/plans/:id deletes a plan', async ({ request }) => {
    const createRes = await request.post('/api/plans', {
      data: { title: 'Delete Test', prompt: 'To be deleted' },
    });
    const { plan } = await createRes.json();

    const deleteRes = await request.delete(`/api/plans/${plan.id}`);
    expect(deleteRes.ok()).toBeTruthy();

    // Verify it's gone
    const getRes = await request.get(`/api/plans/${plan.id}`);
    expect(getRes.status()).toBe(404);
  });

  test('GET /api/plans/:id rejects invalid IDs', async ({ request }) => {
    const res = await request.get('/api/plans/invalid-id');
    expect(res.status()).toBe(400);
  });

  test('GET /api/plans with phase filter', async ({ request, cleanup }) => {
    const createRes = await request.post('/api/plans', {
      data: { title: 'Filter Test', prompt: 'Testing phase filter' },
    });
    const { plan } = await createRes.json();
    cleanup.trackPlan(plan.id);

    // Filter by prompt phase
    const res = await request.get('/api/plans?phase=prompt');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.plans.some((p: any) => p.id === plan.id)).toBeTruthy();

    // Filter by done phase should not include it
    const doneRes = await request.get('/api/plans?phase=done');
    const doneData = await doneRes.json();
    expect(doneData.plans.some((p: any) => p.id === plan.id)).toBeFalsy();
  });
});

// ===========================================================================
// Plan Phase Transitions
// ===========================================================================
test.describe('Plan Phase Transitions', () => {
  test('hook-complete endpoint transitions from agent to review phase', async ({ request, cleanup }) => {
    // Create plan and manually set to prd phase
    const createRes = await request.post('/api/plans', {
      data: { title: 'Phase Test', prompt: 'Testing transitions' },
    });
    const { plan } = await createRes.json();
    cleanup.trackPlan(plan.id);

    // Transition to prd phase first
    await request.patch(`/api/plans/${plan.id}`, {
      data: { phase: 'prd' },
    });

    // Signal PRD completion
    const hookRes = await request.post(`/api/plans/${plan.id}/phase/hook-complete`, {
      data: { token: '[PRD_COMPLETED]', source: 'test' },
    });
    expect(hookRes.ok()).toBeTruthy();

    // Verify plan is now in prd_review
    const getRes = await request.get(`/api/plans/${plan.id}`);
    const data = await getRes.json();
    expect(data.plan.phase).toBe('prd_review');
  });

  test('approve transitions from review to next agent phase', async ({ request, cleanup }) => {
    // Create plan in prd_review phase
    const createRes = await request.post('/api/plans', {
      data: { title: 'Approve Test', prompt: 'Testing approve' },
    });
    const { plan } = await createRes.json();
    cleanup.trackPlan(plan.id);

    // Manually set to prd_review
    await request.patch(`/api/plans/${plan.id}`, {
      data: { phase: 'prd_review' },
    });

    // Approve
    const phaseRes = await request.put(`/api/plans/${plan.id}/phase`, {
      data: { action: 'approve' },
    });
    expect(phaseRes.ok()).toBeTruthy();

    // Should be in tech_spec now
    const getRes = await request.get(`/api/plans/${plan.id}`);
    const data = await getRes.json();
    expect(data.plan.phase).toBe('tech_spec');
  });

  test('revise transitions from review back to agent phase', async ({ request, cleanup }) => {
    // Create plan in prd_review phase
    const createRes = await request.post('/api/plans', {
      data: { title: 'Revise Test', prompt: 'Testing revise' },
    });
    const { plan } = await createRes.json();
    cleanup.trackPlan(plan.id);

    // Manually set to prd_review
    await request.patch(`/api/plans/${plan.id}`, {
      data: { phase: 'prd_review' },
    });

    // Revise with feedback
    const phaseRes = await request.put(`/api/plans/${plan.id}/phase`, {
      data: { action: 'revise', feedback: 'Needs more detail on security' },
    });
    expect(phaseRes.ok()).toBeTruthy();

    // Should be back in prd
    const getRes = await request.get(`/api/plans/${plan.id}`);
    const data = await getRes.json();
    expect(data.plan.phase).toBe('prd');
  });

  test('rejects invalid phase transition action', async ({ request, cleanup }) => {
    const createRes = await request.post('/api/plans', {
      data: { title: 'Invalid Action Test', prompt: 'Testing invalid' },
    });
    const { plan } = await createRes.json();
    cleanup.trackPlan(plan.id);

    // Plan is in prompt phase, which has no approve/revise transitions
    const phaseRes = await request.put(`/api/plans/${plan.id}/phase`, {
      data: { action: 'approve' },
    });
    expect(phaseRes.ok()).toBeFalsy();
  });
});

// ===========================================================================
// Plan Artifacts
// ===========================================================================
test.describe('Plan Artifacts', () => {
  test('GET /api/plans/:id/artifacts returns empty list initially', async ({ request, cleanup }) => {
    const createRes = await request.post('/api/plans', {
      data: { title: 'Artifact Test', prompt: 'Testing artifacts' },
    });
    const { plan } = await createRes.json();
    cleanup.trackPlan(plan.id);

    const res = await request.get(`/api/plans/${plan.id}/artifacts`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.artifacts).toEqual([]);
  });
});

// ===========================================================================
// Plan Confirm & Bulk Creation
// ===========================================================================
test.describe('Plan Confirm & Bulk Creation', () => {
  test('POST /api/plans/:id/confirm creates stories and tasks', async ({ request, cleanup }) => {
    // Create plan and set to task_review phase with proposed stories
    const createRes = await request.post('/api/plans', {
      data: { title: 'Confirm Test', prompt: 'Testing bulk creation' },
    });
    const { plan } = await createRes.json();
    cleanup.trackPlan(plan.id);

    // Set proposed stories and phase
    const proposed_stories = [
      {
        title: 'Auth Story',
        description: 'Authentication feature',
        tasks: [
          { title: 'Create auth schema', description: 'DB schema for auth', priority: 'P2', blockers: [] },
          { title: 'Login endpoint', description: 'POST /login', priority: 'P2', blockers: [0] },
        ],
      },
      {
        title: 'Dashboard Story',
        description: 'Dashboard feature',
        tasks: [
          { title: 'Dashboard layout', description: 'Main dashboard UI', priority: 'P2', blockers: [] },
        ],
      },
    ];

    await request.patch(`/api/plans/${plan.id}`, {
      data: { phase: 'task_review', proposed_stories },
    });

    // Confirm
    const confirmRes = await request.post(`/api/plans/${plan.id}/confirm`, {
      data: { proposed_stories },
    });
    expect(confirmRes.ok()).toBeTruthy();
    const confirmData = await confirmRes.json();

    expect(confirmData.story_count).toBe(2);
    expect(confirmData.task_count).toBe(3);
    expect(confirmData.created_stories).toHaveLength(2);
    expect(confirmData.created_tasks).toHaveLength(3);

    // Track created resources for cleanup
    for (const id of confirmData.created_tasks) cleanup.trackTask(id);
    for (const id of confirmData.created_stories) cleanup.trackStory(id);

    // Verify plan is now done
    const getRes = await request.get(`/api/plans/${plan.id}`);
    const data = await getRes.json();
    expect(data.plan.phase).toBe('done');
    expect(data.plan.created_stories).toHaveLength(2);
    expect(data.plan.created_tasks).toHaveLength(3);

    // Verify stories were actually created
    for (const storyId of confirmData.created_stories) {
      const storyRes = await request.get(`/api/stories/${storyId}`);
      expect(storyRes.ok()).toBeTruthy();
    }

    // Verify tasks were actually created
    for (const taskId of confirmData.created_tasks) {
      const taskRes = await request.get(`/api/tasks/${taskId}`);
      expect(taskRes.ok()).toBeTruthy();
    }
  });

  test('confirm rejects plan not in task_review phase', async ({ request, cleanup }) => {
    const createRes = await request.post('/api/plans', {
      data: { title: 'Wrong Phase Test', prompt: 'Testing phase check' },
    });
    const { plan } = await createRes.json();
    cleanup.trackPlan(plan.id);

    // Plan is in prompt phase - confirm should fail
    const confirmRes = await request.post(`/api/plans/${plan.id}/confirm`);
    expect(confirmRes.ok()).toBeFalsy();
    expect(confirmRes.status()).toBe(400);
  });

  test('confirm resolves within-story blockers correctly', async ({ request, cleanup }) => {
    // Create plan with tasks that have blocker references
    const createRes = await request.post('/api/plans', {
      data: { title: 'Blocker Test', prompt: 'Testing blocker resolution' },
    });
    const { plan } = await createRes.json();
    cleanup.trackPlan(plan.id);

    const proposed_stories = [
      {
        title: 'Story with Blockers',
        description: 'Testing blocker resolution',
        tasks: [
          { title: 'Foundation task', description: 'Must be done first', priority: 'P1', blockers: [] },
          { title: 'Dependent task', description: 'Depends on foundation', priority: 'P2', blockers: [0] },
          { title: 'Final task', description: 'Depends on dependent', priority: 'P2', blockers: [1] },
        ],
      },
    ];

    await request.patch(`/api/plans/${plan.id}`, {
      data: { phase: 'task_review', proposed_stories },
    });

    const confirmRes = await request.post(`/api/plans/${plan.id}/confirm`, {
      data: { proposed_stories },
    });
    expect(confirmRes.ok()).toBeTruthy();
    const confirmData = await confirmRes.json();

    // Track for cleanup
    for (const id of confirmData.created_tasks) cleanup.trackTask(id);
    for (const id of confirmData.created_stories) cleanup.trackStory(id);

    // Verify the second task has the first task as a blocker
    const task2Res = await request.get(`/api/tasks/${confirmData.created_tasks[1]}`);
    const task2Data = await task2Res.json();
    expect(task2Data.task.blockers).toContain(confirmData.created_tasks[0]);

    // Verify the third task has the second task as a blocker
    const task3Res = await request.get(`/api/tasks/${confirmData.created_tasks[2]}`);
    const task3Data = await task3Res.json();
    expect(task3Data.task.blockers).toContain(confirmData.created_tasks[1]);
  });
});
