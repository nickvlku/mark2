import { getDb } from '../db';
import { idCounters } from '../db/schema';
import { eq } from 'drizzle-orm';

export function generateTaskId(mark2Dir?: string): string {
  const db = getDb(mark2Dir);
  const result = db.select().from(idCounters).where(eq(idCounters.entity_type, 'task')).get();
  const nextId = result?.next_id ?? 1;
  db.update(idCounters).set({ next_id: nextId + 1 }).where(eq(idCounters.entity_type, 'task')).run();
  return `TASK-${nextId}`;
}

export function generateStoryId(mark2Dir?: string): string {
  const db = getDb(mark2Dir);
  const result = db.select().from(idCounters).where(eq(idCounters.entity_type, 'story')).get();
  const nextId = result?.next_id ?? 1;
  db.update(idCounters).set({ next_id: nextId + 1 }).where(eq(idCounters.entity_type, 'story')).run();
  return `STORY-${nextId}`;
}

export function generatePlanId(mark2Dir?: string): string {
  const db = getDb(mark2Dir);
  const result = db.select().from(idCounters).where(eq(idCounters.entity_type, 'plan')).get();
  const nextId = result?.next_id ?? 1;
  db.update(idCounters).set({ next_id: nextId + 1 }).where(eq(idCounters.entity_type, 'plan')).run();
  return `PLAN-${nextId}`;
}
