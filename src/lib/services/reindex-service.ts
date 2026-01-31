import fs from 'fs';
import path from 'path';
import { getDb, initializeDatabase } from '../db';
import { tasks, stories, activityEntries, idCounters, corruptFiles } from '../db/schema';
import { YamlReader } from '../yaml/reader';
import type { ReindexResult, ParseError } from '../../types';
import { sql } from 'drizzle-orm';

export class ReindexService {
  private reader: YamlReader;
  private mark2Dir: string;

  constructor(mark2Dir: string) {
    this.mark2Dir = mark2Dir;
    this.reader = new YamlReader(mark2Dir);
  }

  async fullReindex(): Promise<ReindexResult> {
    const db = getDb(this.mark2Dir);
    const errors: ParseError[] = [];

    // Clear derived tables
    db.delete(tasks).run();
    db.delete(stories).run();
    db.delete(activityEntries).run();
    db.delete(corruptFiles).run();

    // Index tasks
    const taskResult = this.reader.readAllTasks();
    let tasksIndexed = 0;
    for (const task of taskResult.tasks) {
      db.insert(tasks).values({
        id: task.id,
        title: task.title,
        description: task.description,
        phase: task.phase,
        priority: task.priority,
        story_id: task.story_id ?? null,
        parent_task: task.parent_task ?? null,
        created_by: task.created_by,
        merge_strategy: task.merge_strategy,
        created_at: task.created_at,
        updated_at: task.updated_at,
        phase_entered_at: task.phase_entered_at,
        loop_count: task.loop_count,
        phase_agents_json: JSON.stringify(task.phase_agents),
        phase_overrides_json: JSON.stringify(task.phase_overrides ?? {}),
        blockers_json: JSON.stringify(task.blockers),
        artifacts_json: JSON.stringify(task.artifacts),
        ports_json: JSON.stringify(task.ports),
        worktrees_json: JSON.stringify(task.worktrees),
      }).run();
      tasksIndexed++;
    }
    errors.push(...taskResult.errors);

    // Index stories
    const storyResult = this.reader.readAllStories();
    let storiesIndexed = 0;
    for (const story of storyResult.stories) {
      db.insert(stories).values({
        id: story.id,
        title: story.title,
        description: story.description,
        created_by: story.created_by,
        created_at: story.created_at,
        updated_at: story.updated_at,
        tasks_json: JSON.stringify(story.tasks),
      }).run();
      storiesIndexed++;
    }
    errors.push(...storyResult.errors);

    // Index activities
    const activityResult = this.reader.readAllActivities();
    let activitiesIndexed = 0;
    for (const activity of activityResult.activities) {
      for (const entry of activity.entries) {
        db.insert(activityEntries).values({
          task_id: activity.task_id,
          timestamp: entry.timestamp,
          source: entry.source,
          type: entry.type,
          message: entry.message,
          metadata_json: entry.metadata ? JSON.stringify(entry.metadata) : null,
        }).run();
        activitiesIndexed++;
      }
    }
    errors.push(...activityResult.errors);

    // Update ID counters based on max existing IDs
    this.updateIdCounters(taskResult.tasks, storyResult.stories);

    // Record corrupt files
    for (const error of errors) {
      db.insert(corruptFiles).values({
        file_path: error.file_path,
        error_message: error.error,
        detected_at: new Date().toISOString(),
        resolved: false,
      }).onConflictDoUpdate({
        target: corruptFiles.file_path,
        set: {
          error_message: error.error,
          detected_at: new Date().toISOString(),
          resolved: false,
        },
      }).run();
    }

    return {
      tasks_indexed: tasksIndexed,
      stories_indexed: storiesIndexed,
      activities_indexed: activitiesIndexed,
      errors,
    };
  }

  async incrementalReindex(changedFiles: string[]): Promise<ReindexResult> {
    const db = getDb(this.mark2Dir);
    const errors: ParseError[] = [];
    let tasksIndexed = 0;
    let storiesIndexed = 0;
    let activitiesIndexed = 0;

    for (const file of changedFiles) {
      const basename = path.basename(file);

      if (basename.match(/^TASK-\d+\.yaml$/) && !basename.includes('.activity.')) {
        const taskId = basename.replace('.yaml', '');
        const { data, error } = this.reader.readTask(taskId);
        if (data) {
          // Upsert task
          db.delete(tasks).where(sql`id = ${data.id}`).run();
          db.insert(tasks).values({
            id: data.id,
            title: data.title,
            description: data.description,
            phase: data.phase,
            priority: data.priority,
            story_id: data.story_id ?? null,
            parent_task: data.parent_task ?? null,
            created_by: data.created_by,
            merge_strategy: data.merge_strategy,
            created_at: data.created_at,
            updated_at: data.updated_at,
            phase_entered_at: data.phase_entered_at,
            loop_count: data.loop_count,
            phase_agents_json: JSON.stringify(data.phase_agents),
            phase_overrides_json: JSON.stringify(data.phase_overrides ?? {}),
            blockers_json: JSON.stringify(data.blockers),
            artifacts_json: JSON.stringify(data.artifacts),
            ports_json: JSON.stringify(data.ports),
            worktrees_json: JSON.stringify(data.worktrees),
          }).run();
          tasksIndexed++;
        }
        if (error) errors.push(error);
      } else if (basename.match(/^TASK-\d+\.activity\.yaml$/)) {
        const taskId = basename.replace('.activity.yaml', '');
        const { data, error } = this.reader.readActivity(taskId);
        if (data) {
          db.delete(activityEntries).where(sql`task_id = ${data.task_id}`).run();
          for (const entry of data.entries) {
            db.insert(activityEntries).values({
              task_id: data.task_id,
              timestamp: entry.timestamp,
              source: entry.source,
              type: entry.type,
              message: entry.message,
              metadata_json: entry.metadata ? JSON.stringify(entry.metadata) : null,
            }).run();
            activitiesIndexed++;
          }
        }
        if (error) errors.push(error);
      } else if (basename.match(/^STORY-\d+\.yaml$/)) {
        const storyId = basename.replace('.yaml', '');
        const { data, error } = this.reader.readStory(storyId);
        if (data) {
          db.delete(stories).where(sql`id = ${data.id}`).run();
          db.insert(stories).values({
            id: data.id,
            title: data.title,
            description: data.description,
            created_by: data.created_by,
            created_at: data.created_at,
            updated_at: data.updated_at,
            tasks_json: JSON.stringify(data.tasks),
          }).run();
          storiesIndexed++;
        }
        if (error) errors.push(error);
      }
    }

    return { tasks_indexed: tasksIndexed, stories_indexed: storiesIndexed, activities_indexed: activitiesIndexed, errors };
  }

  private updateIdCounters(taskList: any[], storyList: any[]): void {
    const db = getDb(this.mark2Dir);

    let maxTaskId = 0;
    for (const t of taskList) {
      const num = parseInt(t.id.replace('TASK-', ''), 10);
      if (num > maxTaskId) maxTaskId = num;
    }

    let maxStoryId = 0;
    for (const s of storyList) {
      const num = parseInt(s.id.replace('STORY-', ''), 10);
      if (num > maxStoryId) maxStoryId = num;
    }

    db.update(idCounters)
      .set({ next_id: maxTaskId + 1 })
      .where(sql`entity_type = 'task'`)
      .run();

    db.update(idCounters)
      .set({ next_id: maxStoryId + 1 })
      .where(sql`entity_type = 'story'`)
      .run();
  }
}
