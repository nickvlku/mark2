import type { Task } from '../../yaml/schemas';
import type { RoleConfig } from './run-phase';
import { getDb } from '../../db';
import { tasks, activityEntries } from '../../db/schema';
import { eq } from 'drizzle-orm';

export interface PendingResult {
  canAdvance: boolean;
  unresolvedBlockers: string[];
}

/**
 * Handle the pending phase for a task.
 *
 * Checks whether all blockers have been resolved. A blocker is considered
 * resolved when the referenced task has reached the "done" phase.
 *
 * Returns whether the task can advance to design.
 */
export async function handlePending(task: Task, mark2Dir?: string): Promise<PendingResult> {
  const blockers = task.blockers ?? [];

  if (blockers.length === 0) {
    return { canAdvance: true, unresolvedBlockers: [] };
  }

  const db = getDb(mark2Dir);
  const unresolvedBlockers: string[] = [];

  for (const blockerId of blockers) {
    const blocker = db
      .select({ phase: tasks.phase })
      .from(tasks)
      .where(eq(tasks.id, blockerId))
      .get();

    if (!blocker || blocker.phase !== 'done') {
      unresolvedBlockers.push(blockerId);
    }
  }

  if (unresolvedBlockers.length === 0) {
    // Log that blockers are resolved
    const now = new Date().toISOString();
    db.insert(activityEntries)
      .values({
        task_id: task.id,
        timestamp: now,
        source: 'orchestration',
        type: 'note',
        message: `All blockers resolved (${blockers.join(', ')}). Task ready to advance.`,
      })
      .run();
  }

  return {
    canAdvance: unresolvedBlockers.length === 0,
    unresolvedBlockers,
  };
}
