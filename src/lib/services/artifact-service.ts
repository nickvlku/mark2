import { getDb } from '../db';
import { tasks } from '../db/schema';
import { YamlReader } from '../yaml/reader';
import { YamlWriter } from '../yaml/writer';
import { TaskArtifact as TaskArtifactSchema } from '../yaml/schemas';
import type { Task, TaskArtifact, Phase } from '../yaml/schemas';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

export class ArtifactService {
  private reader: YamlReader;
  private writer: YamlWriter;
  private mark2Dir: string;

  constructor(mark2Dir?: string) {
    this.mark2Dir = mark2Dir ?? path.join(process.cwd(), '.mark2');
    this.reader = new YamlReader(this.mark2Dir);
    this.writer = new YamlWriter(this.mark2Dir);
  }

  report(
    taskId: string,
    artifact: {
      name: string;
      phase: Phase;
      path: string;
      mime_type?: string;
    },
  ): TaskArtifact {
    const now = new Date().toISOString();

    const entry = TaskArtifactSchema.parse({
      name: artifact.name,
      phase: artifact.phase,
      path: artifact.path,
      mime_type: artifact.mime_type,
      created_at: now,
    });

    // Read current task from YAML
    const { data: task } = this.reader.readTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Add artifact to task
    const updatedArtifacts = [...task.artifacts, entry];
    const updatedTask: Task = {
      ...task,
      artifacts: updatedArtifacts,
      updated_at: now,
    };

    // Write YAML
    this.writer.writeTask(updatedTask);

    // Update SQLite
    const db = getDb(this.mark2Dir);
    db.update(tasks)
      .set({
        artifacts_json: JSON.stringify(updatedArtifacts),
        updated_at: now,
      })
      .where(eq(tasks.id, taskId))
      .run();

    return entry;
  }

  getForTask(taskId: string, phase?: Phase): TaskArtifact[] {
    const db = getDb(this.mark2Dir);
    const row = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
    if (!row) {
      throw new Error(`Task ${taskId} not found`);
    }

    const artifacts: TaskArtifact[] = JSON.parse(row.artifacts_json);
    if (phase) {
      return artifacts.filter((a) => a.phase === phase);
    }
    return artifacts;
  }

  getContent(artifactPath: string): { content: string; exists: boolean } {
    const fullPath = path.join(this.mark2Dir, 'artifacts', artifactPath);
    if (!fs.existsSync(fullPath)) {
      return { content: '', exists: false };
    }
    const content = fs.readFileSync(fullPath, 'utf-8');
    return { content, exists: true };
  }
}
