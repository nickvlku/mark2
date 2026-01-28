import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';
import { TaskSchema, ActivityLog, StorySchema, ConfigSchema } from './schemas';
import type { Task, Story, Config, ActivityLog as ActivityLogType } from './schemas';

export class YamlWriter {
  constructor(private mark2Dir: string) {}

  writeTask(task: Task): void {
    TaskSchema.parse(task);
    const filePath = path.join(this.mark2Dir, 'tasks', `${task.id}.yaml`);
    this.atomicWrite(filePath, task);
  }

  writeActivity(activity: ActivityLogType): void {
    ActivityLog.parse(activity);
    const filePath = path.join(this.mark2Dir, 'tasks', `${activity.task_id}.activity.yaml`);
    this.atomicWrite(filePath, activity);
  }

  writeStory(story: Story): void {
    StorySchema.parse(story);
    const filePath = path.join(this.mark2Dir, 'stories', `${story.id}.yaml`);
    this.atomicWrite(filePath, story);
  }

  writeConfig(config: Config): void {
    ConfigSchema.parse(config);
    const filePath = path.join(this.mark2Dir, 'config.yaml');
    this.atomicWrite(filePath, config);
  }

  deleteTask(taskId: string): void {
    const taskPath = path.join(this.mark2Dir, 'tasks', `${taskId}.yaml`);
    const activityPath = path.join(this.mark2Dir, 'tasks', `${taskId}.activity.yaml`);
    if (fs.existsSync(taskPath)) fs.unlinkSync(taskPath);
    if (fs.existsSync(activityPath)) fs.unlinkSync(activityPath);
  }

  deleteStory(storyId: string): void {
    const storyPath = path.join(this.mark2Dir, 'stories', `${storyId}.yaml`);
    if (fs.existsSync(storyPath)) fs.unlinkSync(storyPath);
  }

  private atomicWrite(filePath: string, data: any): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const content = YAML.stringify(data, { lineWidth: 0 });
    // Write to temp file in the same directory then rename (must be same filesystem for atomic rename)
    const tmpPath = path.join(dir, `.tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, filePath);
  }
}
