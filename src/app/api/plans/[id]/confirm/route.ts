import { NextResponse } from 'next/server';
import { createPlanService, createStoryService, createTaskService } from '@/lib/services/factory';
import { isValidPlanId } from '@/lib/utils/route-validation';
import type { ProposedStory } from '@/lib/yaml/schemas';

const planService = createPlanService();
const storyService = createStoryService();
const taskService = createTaskService();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidPlanId(id)) {
      return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
    }

    const plan = planService.getById(id);
    if (!plan) {
      return NextResponse.json({ error: `Plan ${id} not found` }, { status: 404 });
    }

    if (plan.phase !== 'task_review') {
      return NextResponse.json(
        { error: `Plan must be in task_review phase to confirm (currently: ${plan.phase})` },
        { status: 400 },
      );
    }

    // Accept optional user-modified stories and project prefix from request body
    const body = await request.json().catch(() => ({}));
    const proposedStories: ProposedStory[] = body.proposed_stories || plan.proposed_stories;
    const projectPrefix: string = body.project_prefix || plan.project_prefix || plan.title;

    if (!proposedStories || proposedStories.length === 0) {
      return NextResponse.json(
        { error: 'No proposed stories to create' },
        { status: 400 },
      );
    }

    const createdStories: string[] = [];
    const createdTasks: string[] = [];
    // Map storyIndex:taskIndex -> actual task ID for blocker resolution
    const taskIdMap = new Map<string, string>();

    // Create stories and tasks
    for (let si = 0; si < proposedStories.length; si++) {
      const proposedStory = proposedStories[si];

      // Create the story with plan prefix and plan_id
      const story = await storyService.create({
        title: `[${projectPrefix}] ${proposedStory.title}`,
        description: proposedStory.description,
        created_by: 'plan',
        plan_id: id,
      });
      createdStories.push(story.id);

      // Create tasks within the story
      for (let ti = 0; ti < proposedStory.tasks.length; ti++) {
        const proposedTask = proposedStory.tasks[ti];

        const task = await taskService.create({
          title: proposedTask.title,
          description: proposedTask.description,
          priority: proposedTask.priority,
          story_id: story.id,
          created_by: 'plan',
        });
        createdTasks.push(task.id);
        taskIdMap.set(`${si}:${ti}`, task.id);

        // Add task to story
        await storyService.addTask(story.id, task.id);
      }
    }

    // Resolve blockers (second pass)
    for (let si = 0; si < proposedStories.length; si++) {
      const proposedStory = proposedStories[si];
      for (let ti = 0; ti < proposedStory.tasks.length; ti++) {
        const proposedTask = proposedStory.tasks[ti];
        const taskId = taskIdMap.get(`${si}:${ti}`);
        if (!taskId) continue;

        for (const blockerIdx of proposedTask.blockers) {
          // Blockers are indices within the same story by default
          let blockerKey: string;
          if (typeof blockerIdx === 'string' && blockerIdx.includes(':')) {
            blockerKey = blockerIdx;
          } else {
            blockerKey = `${si}:${blockerIdx}`;
          }

          const blockerTaskId = taskIdMap.get(blockerKey);
          if (blockerTaskId) {
            await taskService.addBlocker(taskId, blockerTaskId);
          }
        }
      }
    }

    // Update plan with created IDs and transition to done
    await planService.update(id, {
      created_stories: createdStories,
      created_tasks: createdTasks,
    });
    await planService.transitionPhase(id, 'done');

    return NextResponse.json({
      success: true,
      plan_id: id,
      created_stories: createdStories,
      created_tasks: createdTasks,
      story_count: createdStories.length,
      task_count: createdTasks.length,
    }, { status: 201 });
  } catch (error: any) {
    console.error('[plan-confirm] Error:', error);
    return NextResponse.json(
      { error: error.message ?? 'Failed to confirm plan' },
      { status: 500 },
    );
  }
}
