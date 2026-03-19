import fs from 'fs';
import path from 'path';
import { getDb, initializeDatabase } from '../db';
import { tasks, stories, plans, activityEntries, idCounters, corruptFiles } from '../db/schema';
import { YamlReader } from '../yaml/reader';
import { StateBranchService } from './state-branch-service';
import type { ReindexResult, ParseError } from '../../types';
import { sql } from 'drizzle-orm';

export class ReindexService {
  private mark2Dir: string;
  private stateBranch: StateBranchService;

  constructor(mark2Dir: string, stateBranch?: StateBranchService) {
    this.mark2Dir = mark2Dir;
    this.stateBranch = stateBranch ?? new StateBranchService(mark2Dir);
  }

  /**
   * Full reindex from the state branch.
   * 1. Ensures the state worktree exists
   * 2. Pulls latest from remote (if available)
   * 3. Rebuilds SQLite from the .state/ YAML files
   */
  async fullReindex(): Promise<ReindexResult> {
    // Ensure worktree exists and pull latest
    await this.stateBranch.ensureWorktree();
    const pullResult = await this.stateBranch.pull();
    this.stateBranch.mirrorRepoFilesToLocal();

    // Use a YamlReader pointed at the state directory
    const stateDir = this.stateBranch.getStateDir();
    const reader = new YamlReader(stateDir);

    const db = getDb(this.mark2Dir);
    const errors: ParseError[] = [];

    // Clear derived tables
    db.delete(tasks).run();
    db.delete(stories).run();
    db.delete(plans).run();
    db.delete(activityEntries).run();
    db.delete(corruptFiles).run();

    // Index tasks
    const taskResult = reader.readAllTasks();
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
        auto_advance: task.auto_advance,
        auto_approve: task.auto_approve,
        created_at: task.created_at,
        updated_at: task.updated_at,
        phase_entered_at: task.phase_entered_at,
        loop_count: task.loop_count,
        archived: task.archived ?? false,
        archived_at: task.archived_at ?? null,
        phase_agents_json: JSON.stringify(task.phase_agents ?? {}),
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
    const storyResult = reader.readAllStories();
    let storiesIndexed = 0;
    for (const story of storyResult.stories) {
      db.insert(stories).values({
        id: story.id,
        title: story.title,
        description: story.description,
        plan_id: story.plan_id ?? null,
        created_by: story.created_by,
        created_at: story.created_at,
        updated_at: story.updated_at,
        tasks_json: JSON.stringify(story.tasks),
        execution_json: JSON.stringify(story.execution ?? {}),
      }).run();
      storiesIndexed++;
    }
    errors.push(...storyResult.errors);

    // Index plans
    const planResult = reader.readAllPlans();
    let plansIndexed = 0;
    for (const plan of planResult.plans) {
      db.insert(plans).values({
        id: plan.id,
        title: plan.title,
        prompt: plan.prompt,
        phase: plan.phase,
        created_by: plan.created_by,
        created_at: plan.created_at,
        updated_at: plan.updated_at,
        phase_entered_at: plan.phase_entered_at,
        artifacts_json: JSON.stringify(plan.artifacts),
        proposed_stories_json: JSON.stringify(plan.proposed_stories),
        created_stories_json: JSON.stringify(plan.created_stories),
        created_tasks_json: JSON.stringify(plan.created_tasks),
        project_prefix: plan.project_prefix ?? null,
      }).run();
      plansIndexed++;
    }
    errors.push(...planResult.errors);

    // Index activities
    const activityResult = reader.readAllActivities();
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
    this.updateIdCounters(taskResult.tasks, storyResult.stories, planResult.plans);

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
      plans_indexed: plansIndexed,
      activities_indexed: activitiesIndexed,
      errors,
      sync_result: pullResult,
    };
  }

  /**
   * Incremental reindex for specific files (used by file watchers).
   * Note: In the new architecture, this is less important as the
   * canonical source is the state branch, not local files.
   */
  async incrementalReindex(changedFiles: string[]): Promise<ReindexResult> {
    const stateDir = this.stateBranch.getStateDir();
    const reader = new YamlReader(stateDir);
    const db = getDb(this.mark2Dir);
    const errors: ParseError[] = [];
    let tasksIndexed = 0;
    let storiesIndexed = 0;
    let plansIndexed = 0;
    let activitiesIndexed = 0;

    for (const file of changedFiles) {
      const basename = path.basename(file);

      if (basename.match(/^TASK-\d+\.yaml$/) && !basename.includes('.activity.')) {
        const taskId = basename.replace('.yaml', '');
        const { data, error } = reader.readTask(taskId);
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
            auto_advance: data.auto_advance,
            auto_approve: data.auto_approve,
            created_at: data.created_at,
            updated_at: data.updated_at,
            phase_entered_at: data.phase_entered_at,
            loop_count: data.loop_count,
            archived: data.archived ?? false,
            archived_at: data.archived_at ?? null,
            phase_agents_json: JSON.stringify(data.phase_agents ?? {}),
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
        const { data, error } = reader.readActivity(taskId);
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
        const { data, error } = reader.readStory(storyId);
        if (data) {
          db.delete(stories).where(sql`id = ${data.id}`).run();
          db.insert(stories).values({
            id: data.id,
            title: data.title,
            description: data.description,
            plan_id: data.plan_id ?? null,
            created_by: data.created_by,
            created_at: data.created_at,
            updated_at: data.updated_at,
            tasks_json: JSON.stringify(data.tasks),
            execution_json: JSON.stringify(data.execution ?? {}),
          }).run();
          storiesIndexed++;
        }
        if (error) errors.push(error);
      } else if (basename.match(/^PLAN-\d+\.yaml$/)) {
        const planId = basename.replace('.yaml', '');
        const { data, error } = reader.readPlan(planId);
        if (data) {
          db.delete(plans).where(sql`id = ${data.id}`).run();
          db.insert(plans).values({
            id: data.id,
            title: data.title,
            prompt: data.prompt,
            phase: data.phase,
            created_by: data.created_by,
            created_at: data.created_at,
            updated_at: data.updated_at,
            phase_entered_at: data.phase_entered_at,
            artifacts_json: JSON.stringify(data.artifacts),
            proposed_stories_json: JSON.stringify(data.proposed_stories),
            created_stories_json: JSON.stringify(data.created_stories),
            created_tasks_json: JSON.stringify(data.created_tasks),
            project_prefix: data.project_prefix ?? null,
          }).run();
          plansIndexed++;
        }
        if (error) errors.push(error);
      }
    }

    return { tasks_indexed: tasksIndexed, stories_indexed: storiesIndexed, plans_indexed: plansIndexed, activities_indexed: activitiesIndexed, errors };
  }

  private updateIdCounters(taskList: any[], storyList: any[], planList: any[] = []): void {
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

    let maxPlanId = 0;
    for (const p of planList) {
      const num = parseInt(p.id.replace('PLAN-', ''), 10);
      if (num > maxPlanId) maxPlanId = num;
    }

    if (maxPlanId > 0) {
      db.update(idCounters)
        .set({ next_id: maxPlanId + 1 })
        .where(sql`entity_type = 'plan'`)
        .run();
    }
  }
}
