import { getDb } from '../db';
import { activityEntries } from '../db/schema';
import { ActivityEntry as ActivityEntrySchema } from '../yaml/schemas';
import type { ActivityEntry } from '../yaml/schemas';
import { eq, desc } from 'drizzle-orm';
import { getMark2Dir } from '../utils/mark2-dir';
import { StateBranchService } from './state-branch-service';
import path from 'path';

export class ActivityService {
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

  async log(
    taskId: string,
    source: string,
    type: ActivityEntry['type'],
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<ActivityEntry> {
    const now = new Date().toISOString();

    const entry = ActivityEntrySchema.parse({
      timestamp: now,
      source,
      type,
      message,
      metadata,
    });

    // Append to activity YAML on state branch
    const activityData = await this.stateBranch.readYaml<{ task_id: string; entries: ActivityEntry[] }>(`tasks/${taskId}.activity.yaml`);
    const entries = activityData?.entries ?? [];
    entries.push(entry);
    await this.stateBranch.writeYaml(`tasks/${taskId}.activity.yaml`, { task_id: taskId, entries });

    // Insert into SQLite
    const db = getDb(this.mark2Dir);
    db.insert(activityEntries).values({
      task_id: taskId,
      timestamp: entry.timestamp,
      source: entry.source,
      type: entry.type,
      message: entry.message,
      metadata_json: entry.metadata ? JSON.stringify(entry.metadata) : null,
    }).run();

    return entry;
  }

  // Synchronous version for backwards compatibility
  logSync(
    taskId: string,
    source: string,
    type: ActivityEntry['type'],
    message: string,
    metadata?: Record<string, unknown>,
  ): ActivityEntry {
    const now = new Date().toISOString();

    const entry = ActivityEntrySchema.parse({
      timestamp: now,
      source,
      type,
      message,
      metadata,
    });

    // Append to activity YAML on state branch (fire and forget)
    this.stateBranch.readYaml<{ task_id: string; entries: ActivityEntry[] }>(`tasks/${taskId}.activity.yaml`).then(activityData => {
      const entries = activityData?.entries ?? [];
      entries.push(entry);
      this.stateBranch.writeYaml(`tasks/${taskId}.activity.yaml`, { task_id: taskId, entries }).catch(() => {});
    }).catch(() => {});

    // Insert into SQLite
    const db = getDb(this.mark2Dir);
    db.insert(activityEntries).values({
      task_id: taskId,
      timestamp: entry.timestamp,
      source: entry.source,
      type: entry.type,
      message: entry.message,
      metadata_json: entry.metadata ? JSON.stringify(entry.metadata) : null,
    }).run();

    return entry;
  }

  getForTask(
    taskId: string,
    limit?: number,
    offset?: number,
  ): ActivityEntry[] {
    const db = getDb(this.mark2Dir);

    let query = db
      .select()
      .from(activityEntries)
      .where(eq(activityEntries.task_id, taskId))
      .orderBy(desc(activityEntries.timestamp))
      .$dynamic();

    if (limit !== undefined) {
      query = query.limit(limit);
    }
    if (offset !== undefined) {
      query = query.offset(offset);
    }

    const rows = query.all();

    return rows.map((row) => ({
      timestamp: row.timestamp,
      source: row.source,
      type: row.type as ActivityEntry['type'],
      message: row.message,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    }));
  }
}
