import { getDb } from '../db';
import { activityEntries } from '../db/schema';
import { YamlReader } from '../yaml/reader';
import { YamlWriter } from '../yaml/writer';
import { ActivityEntry as ActivityEntrySchema } from '../yaml/schemas';
import type { ActivityEntry } from '../yaml/schemas';
import { eq, desc } from 'drizzle-orm';
import path from 'path';

export class ActivityService {
  private reader: YamlReader;
  private writer: YamlWriter;
  private mark2Dir: string;

  constructor(mark2Dir?: string) {
    this.mark2Dir = mark2Dir ?? path.join(process.cwd(), '.mark2');
    this.reader = new YamlReader(this.mark2Dir);
    this.writer = new YamlWriter(this.mark2Dir);
  }

  log(
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

    // Append to activity YAML
    const { data: activityLog } = this.reader.readActivity(taskId);
    const entries = activityLog?.entries ?? [];
    entries.push(entry);
    this.writer.writeActivity({ task_id: taskId, entries });

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
