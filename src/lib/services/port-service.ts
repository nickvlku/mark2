import { getDb } from '../db';
import { portAllocations } from '../db/schema';
import { allocatePortsForTask } from '../utils/port-allocator';
import { eq } from 'drizzle-orm';
import { getMark2Dir } from '../utils/mark2-dir';
import path from 'path';

export interface PortAllocation {
  task_id: string;
  ports: number[];
  services: Record<string, number>;
  allocated_at: string;
}

export class PortService {
  private mark2Dir: string;

  constructor(mark2Dir?: string) {
    this.mark2Dir = mark2Dir ?? getMark2Dir();
  }

  allocate(taskId: string, basePort?: number, portsPerTask?: number): PortAllocation {
    const db = getDb(this.mark2Dir);

    // Check if already allocated
    const existing = db.select().from(portAllocations).where(eq(portAllocations.task_id, taskId)).get();
    if (existing) {
      return {
        task_id: existing.task_id,
        ports: JSON.parse(existing.ports_json),
        services: JSON.parse(existing.services_json),
        allocated_at: existing.allocated_at,
      };
    }

    const ports = allocatePortsForTask(taskId, basePort, portsPerTask);
    const now = new Date().toISOString();

    const allocation: PortAllocation = {
      task_id: taskId,
      ports,
      services: {},
      allocated_at: now,
    };

    db.insert(portAllocations).values({
      task_id: taskId,
      ports_json: JSON.stringify(ports),
      services_json: JSON.stringify({}),
      allocated_at: now,
    }).run();

    return allocation;
  }

  release(taskId: string): void {
    const db = getDb(this.mark2Dir);
    db.delete(portAllocations).where(eq(portAllocations.task_id, taskId)).run();
  }

  list(): PortAllocation[] {
    const db = getDb(this.mark2Dir);
    const rows = db.select().from(portAllocations).all();
    return rows.map((row) => ({
      task_id: row.task_id,
      ports: JSON.parse(row.ports_json),
      services: JSON.parse(row.services_json),
      allocated_at: row.allocated_at,
    }));
  }
}
