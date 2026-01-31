import { getDb } from '../db';
import { stories, tasks } from '../db/schema';
import { YamlReader } from '../yaml/reader';
import { YamlWriter } from '../yaml/writer';
import { StorySchema } from '../yaml/schemas';
import type { Story, StoryStatus } from '../yaml/schemas';
import { generateStoryId } from '../utils/id-generator';
import { eq, and } from 'drizzle-orm';
import path from 'path';

export class StoryService {
  private reader: YamlReader;
  private writer: YamlWriter;
  private mark2Dir: string;

  constructor(mark2Dir?: string) {
    this.mark2Dir = mark2Dir ?? path.join(process.cwd(), '.mark2');
    this.reader = new YamlReader(this.mark2Dir);
    this.writer = new YamlWriter(this.mark2Dir);
  }

  create(data: {
    title: string;
    description: string;
    created_by: string;
  }): Story {
    const now = new Date().toISOString();
    const id = generateStoryId(this.mark2Dir);

    const story = StorySchema.parse({
      id,
      title: data.title,
      description: data.description,
      tasks: [],
      created_by: data.created_by,
      created_at: now,
      updated_at: now,
    });

    // Write YAML (canonical store)
    this.writer.writeStory(story);

    // Update SQLite (index)
    const db = getDb(this.mark2Dir);
    db.insert(stories).values({
      id: story.id,
      title: story.title,
      description: story.description,
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

  update(storyId: string, updates: Partial<Story>): Story {
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

    // Write YAML
    this.writer.writeStory(story);

    // Update SQLite
    const db = getDb(this.mark2Dir);
    db.update(stories)
      .set({
        title: story.title,
        description: story.description,
        created_by: story.created_by,
        created_at: story.created_at,
        updated_at: story.updated_at,
        tasks_json: JSON.stringify(story.tasks),
      })
      .where(eq(stories.id, storyId))
      .run();

    return story;
  }

  delete(storyId: string): void {
    // Delete YAML
    this.writer.deleteStory(storyId);

    // Delete from SQLite
    const db = getDb(this.mark2Dir);
    db.delete(stories).where(eq(stories.id, storyId)).run();
  }

  addTask(storyId: string, taskId: string): Story {
    const story = this.getById(storyId);
    if (!story) {
      throw new Error(`Story ${storyId} not found`);
    }
    if (story.tasks.includes(taskId)) {
      return story; // Already exists
    }
    return this.update(storyId, {
      tasks: [...story.tasks, taskId],
    });
  }

  removeTask(storyId: string, taskId: string): Story {
    const story = this.getById(storyId);
    if (!story) {
      throw new Error(`Story ${storyId} not found`);
    }
    return this.update(storyId, {
      tasks: story.tasks.filter((t) => t !== taskId),
    });
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
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      tasks: JSON.parse(row.tasks_json),
    };
  }
}
