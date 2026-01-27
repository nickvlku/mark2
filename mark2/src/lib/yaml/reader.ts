import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { z } from 'zod';
import { TaskSchema, ActivityLog, StorySchema, ConfigSchema } from './schemas';
import type { Task, Story, Config, ActivityLog as ActivityLogType, ParseError } from './schemas';

export class YamlReader {
  constructor(private mark2Dir: string) {}

  readTask(taskId: string): { data: Task | null; error: ParseError | null } {
    const filePath = path.join(this.mark2Dir, 'tasks', `${taskId}.yaml`);
    return this.readAndValidate(filePath, TaskSchema);
  }

  readAllTasks(): { tasks: Task[]; errors: ParseError[] } {
    const tasksDir = path.join(this.mark2Dir, 'tasks');
    const tasks: Task[] = [];
    const errors: ParseError[] = [];

    if (!fs.existsSync(tasksDir)) return { tasks, errors };

    const files = fs.readdirSync(tasksDir).filter(f => /^TASK-\d+\.yaml$/.test(f));
    for (const file of files) {
      const filePath = path.join(tasksDir, file);
      const { data, error } = this.readAndValidate(filePath, TaskSchema);
      if (data) tasks.push(data);
      if (error) errors.push(error);
    }

    return { tasks, errors };
  }

  readActivity(taskId: string): { data: ActivityLogType | null; error: ParseError | null } {
    const filePath = path.join(this.mark2Dir, 'tasks', `${taskId}.activity.yaml`);
    return this.readAndValidate(filePath, ActivityLog);
  }

  readAllActivities(): { activities: ActivityLogType[]; errors: ParseError[] } {
    const tasksDir = path.join(this.mark2Dir, 'tasks');
    const activities: ActivityLogType[] = [];
    const errors: ParseError[] = [];

    if (!fs.existsSync(tasksDir)) return { activities, errors };

    const files = fs.readdirSync(tasksDir).filter(f => /^TASK-\d+\.activity\.yaml$/.test(f));
    for (const file of files) {
      const filePath = path.join(tasksDir, file);
      const { data, error } = this.readAndValidate(filePath, ActivityLog);
      if (data) activities.push(data);
      if (error) errors.push(error);
    }

    return { activities, errors };
  }

  readStory(storyId: string): { data: Story | null; error: ParseError | null } {
    const filePath = path.join(this.mark2Dir, 'stories', `${storyId}.yaml`);
    return this.readAndValidate(filePath, StorySchema);
  }

  readAllStories(): { stories: Story[]; errors: ParseError[] } {
    const storiesDir = path.join(this.mark2Dir, 'stories');
    const stories: Story[] = [];
    const errors: ParseError[] = [];

    if (!fs.existsSync(storiesDir)) return { stories, errors };

    const files = fs.readdirSync(storiesDir).filter(f => /^STORY-\d+\.yaml$/.test(f));
    for (const file of files) {
      const filePath = path.join(storiesDir, file);
      const { data, error } = this.readAndValidate(filePath, StorySchema);
      if (data) stories.push(data);
      if (error) errors.push(error);
    }

    return { stories, errors };
  }

  readConfig(): { data: Config | null; error: ParseError | null } {
    const filePath = path.join(this.mark2Dir, 'config.yaml');
    return this.readAndValidate(filePath, ConfigSchema);
  }

  private readAndValidate<T>(filePath: string, schema: z.ZodSchema<T>): { data: T | null; error: ParseError | null } {
    try {
      if (!fs.existsSync(filePath)) {
        return { data: null, error: { file_path: filePath, error: 'File not found', preserved: false } };
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = YAML.parse(content);
      const result = schema.safeParse(parsed);
      if (result.success) {
        return { data: result.data, error: null };
      }
      return {
        data: null,
        error: {
          file_path: filePath,
          error: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '),
          preserved: false,
        },
      };
    } catch (e: any) {
      return {
        data: null,
        error: { file_path: filePath, error: e.message, preserved: false },
      };
    }
  }
}
