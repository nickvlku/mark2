import { getDb } from '../db';
import { stories, tasks } from '../db/schema';
import { StorySchema } from '../yaml/schemas';
import type { Story, StoryStatus } from '../yaml/schemas';
import { generateStoryId } from '../utils/id-generator';
import { eq, and } from 'drizzle-orm';
import { getMark2Dir } from '../utils/mark2-dir';
import { StateBranchService } from './state-branch-service';
import path from 'path';

export class StoryService {
  private mark2Dir: string;
  private stateBranch: StateBranchService;

  /**
   * @param mark2Dir - The .mark2 directory path
   * @param stateBranch - Optional StateBranchService instance
   * @param localOnly - If true, skip git operations (for testing)
   */
  constructor(mark2Dir?: string, stateBranch?: StateBranchService, localOnly: boolean = false) {
    this.mark2Dir = mark2Dir ?? getMark2Dir();
    this.stateBranch = stateBranch ?? new StateBranchService(this.mark2Dir, localOnly);
  }

  async create(data: {
    title: string;
    description: string;
    created_by: string;
    plan_id?: string;
  }): Promise<Story> {
    const now = new Date().toISOString();
    const id = generateStoryId(this.mark2Dir);

    const story = StorySchema.parse({
      id,
      title: data.title,
      description: data.description,
      tasks: [],
      plan_id: data.plan_id,
      created_by: data.created_by,
      created_at: now,
      updated_at: now,
    });

    // Write to state branch
    await this.stateBranch.writeYaml(`stories/${story.id}.yaml`, story);

    // Update SQLite (index)
    const db = getDb(this.mark2Dir);
    db.insert(stories).values({
      id: story.id,
      title: story.title,
      description: story.description,
      plan_id: story.plan_id ?? null,
      created_by: story.created_by,
      created_at: story.created_at,
      updated_at: story.updated_at,
      tasks_json: JSON.stringify(story.tasks),
    }).run();

    // Push to remote
    await this.stateBranch.push(`Create ${story.id}: ${story.title}`);

    return story;
  }

  // Synchronous version for backwards compatibility
  createSync(data: {
    title: string;
    description: string;
    created_by: string;
    plan_id?: string;
  }): Story {
    const now = new Date().toISOString();
    const id = generateStoryId(this.mark2Dir);

    const story = StorySchema.parse({
      id,
      title: data.title,
      description: data.description,
      tasks: [],
      plan_id: data.plan_id,
      created_by: data.created_by,
      created_at: now,
      updated_at: now,
    });

    // Write to state branch (fire and forget)
    this.stateBranch.writeYaml(`stories/${story.id}.yaml`, story).then(() => {
      this.stateBranch.push(`Create ${story.id}: ${story.title}`).catch(() => {});
    }).catch(() => {});

    // Update SQLite (index)
    const db = getDb(this.mark2Dir);
    db.insert(stories).values({
      id: story.id,
      title: story.title,
      description: story.description,
      plan_id: story.plan_id ?? null,
      created_by: story.created_by,
      created_at: story.created_at,
      updated_at: story.updated_at,
      tasks_json: JSON.stringify(story.tasks),
    }).run();

    return story;
  }

  getById(storyId: string): Story | null {
    const db = getDb(this.mark2Dir);
    const row = db.select().from(stories).where(eq(stories.id, storyId)).get();
    if (!row) return null;
    return this.rowToStory(row);
  }

  list(filters?: { status?: StoryStatus }): Array<Story & { status: StoryStatus }> {
    const db = getDb(this.mark2Dir);
    const rows = db.select().from(stories).all();
    const result = rows.map((row) => {
      const story = this.rowToStory(row);
      const status = this.deriveStatus(story);
      return { ...story, status };
    });

    if (filters?.status) {
      return result.filter((s) => s.status === filters.status);
    }
    return result;
  }

  async update(storyId: string, updates: Partial<Story>): Promise<Story> {
    const existing = this.getById(storyId);
    if (!existing) {
      throw new Error(`Story ${storyId} not found`);
    }

    const now = new Date().toISOString();
    const merged = {
      ...existing,
      ...updates,
      id: storyId, // Prevent ID change
      updated_at: now,
    };

    const story = StorySchema.parse(merged);

    // Write to state branch
    await this.stateBranch.writeYaml(`stories/${story.id}.yaml`, story);

    // Update SQLite
    const db = getDb(this.mark2Dir);
    db.update(stories)
      .set({
        title: story.title,
        description: story.description,
        plan_id: story.plan_id ?? null,
        created_by: story.created_by,
        created_at: story.created_at,
        updated_at: story.updated_at,
        tasks_json: JSON.stringify(story.tasks),
      })
      .where(eq(stories.id, storyId))
      .run();

    return story;
  }

  // Synchronous update for backwards compatibility
  updateSync(storyId: string, updates: Partial<Story>): Story {
    const existing = this.getById(storyId);
    if (!existing) {
      throw new Error(`Story ${storyId} not found`);
    }

    const now = new Date().toISOString();
    const merged = {
      ...existing,
      ...updates,
      id: storyId,
      updated_at: now,
    };

    const story = StorySchema.parse(merged);

    // Write to state branch (fire and forget)
    this.stateBranch.writeYaml(`stories/${story.id}.yaml`, story).catch(() => {});

    // Update SQLite
    const db = getDb(this.mark2Dir);
    db.update(stories)
      .set({
        title: story.title,
        description: story.description,
        plan_id: story.plan_id ?? null,
        created_by: story.created_by,
        created_at: story.created_at,
        updated_at: story.updated_at,
        tasks_json: JSON.stringify(story.tasks),
      })
      .where(eq(stories.id, storyId))
      .run();

    return story;
  }

  async delete(storyId: string): Promise<void> {
    // Delete from state branch
    await this.stateBranch.deleteFile(`stories/${storyId}.yaml`);
    await this.stateBranch.push(`Delete ${storyId}`);

    // Delete from SQLite
    const db = getDb(this.mark2Dir);
    db.delete(stories).where(eq(stories.id, storyId)).run();
  }

  async addTask(storyId: string, taskId: string): Promise<Story> {
    const story = this.getById(storyId);
    if (!story) {
      throw new Error(`Story ${storyId} not found`);
    }
    if (story.tasks.includes(taskId)) {
      return story; // Already exists
    }
    const updated = await this.update(storyId, {
      tasks: [...story.tasks, taskId],
    });
    await this.stateBranch.push(`Add ${taskId} to ${storyId}`);
    return updated;
  }

  async removeTask(storyId: string, taskId: string): Promise<Story> {
    const story = this.getById(storyId);
    if (!story) {
      throw new Error(`Story ${storyId} not found`);
    }
    const updated = await this.update(storyId, {
      tasks: story.tasks.filter((t) => t !== taskId),
    });
    await this.stateBranch.push(`Remove ${taskId} from ${storyId}`);
    return updated;
  }

  getStatus(storyId: string): StoryStatus {
    const story = this.getById(storyId);
    if (!story) {
      throw new Error(`Story ${storyId} not found`);
    }
    return this.deriveStatus(story);
  }

  private deriveStatus(story: Story): StoryStatus {
    if (story.tasks.length === 0) return 'pending';

    const db = getDb(this.mark2Dir);
    let allDone = true;
    let anyStarted = false;

    for (const taskId of story.tasks) {
      const row = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
      if (!row) continue;
      if (row.phase === 'done') {
        anyStarted = true;
      } else {
        allDone = false;
        if (row.phase !== 'pending') {
          anyStarted = true;
        }
      }
    }

    if (allDone && story.tasks.length > 0) return 'completed';
    if (anyStarted) return 'in_progress';
    return 'pending';
  }

  private rowToStory(row: typeof stories.$inferSelect): Story {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      plan_id: row.plan_id ?? undefined,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      tasks: JSON.parse(row.tasks_json),
    };
  }
}
