import { getDb } from '../db';
import { tasks } from '../db/schema';
import { YamlReader } from '../yaml/reader';
import { YamlWriter } from '../yaml/writer';
import { TaskArtifact as TaskArtifactSchema } from '../yaml/schemas';
import type { Task, TaskArtifact, Phase } from '../yaml/schemas';
import { eq } from 'drizzle-orm';
import { getMark2Dir } from '../utils/mark2-dir';
import fs from 'fs';
import path from 'path';

export class ArtifactService {
  private reader: YamlReader;
  private writer: YamlWriter;
  private mark2Dir: string;

  constructor(mark2Dir?: string) {
    this.mark2Dir = mark2Dir ?? getMark2Dir();
    const stateDir = path.join(this.mark2Dir, '.state');
    this.reader = new YamlReader(stateDir);
    this.writer = new YamlWriter(stateDir);
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

  /**
   * Get the most recent artifact matching a name pattern.
   * Useful for finding artifacts like "design-document" regardless of timestamp.
   */
  getMostRecentByName(taskId: string, namePattern: string): TaskArtifact | null {
    const artifacts = this.getForTask(taskId);
    const matching = artifacts.filter((a) => a.name.includes(namePattern));
    if (matching.length === 0) return null;

    // Sort by created_at descending and return most recent
    matching.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA;
    });

    return matching[0];
  }

  /**
   * Read the content of the most recent artifact matching a name pattern.
   */
  getMostRecentContent(taskId: string, namePattern: string): { content: string; artifact: TaskArtifact | null } {
    const artifact = this.getMostRecentByName(taskId, namePattern);
    if (!artifact) {
      return { content: '', artifact: null };
    }

    // Build full path to the artifact file (always in main .mark2/storage/)
    const storagePath = path.join(this.mark2Dir, 'storage', taskId, 'artifacts', artifact.path);

    if (!fs.existsSync(storagePath)) {
      return { content: '', artifact };
    }

    const content = fs.readFileSync(storagePath, 'utf-8');
    return { content, artifact };
  }
}
