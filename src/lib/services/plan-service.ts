import { getDb } from '../db';
import { plans } from '../db/schema';
import { PlanSchema, PlanPhase } from '../yaml/schemas';
import type { Plan, PlanArtifact } from '../yaml/schemas';
import { generatePlanId } from '../utils/id-generator';
import { eq, and } from 'drizzle-orm';
import { getMark2Dir } from '../utils/mark2-dir';
import { StateBranchService } from './state-branch-service';
import fs from 'fs';
import path from 'path';

export class PlanService {
  private mark2Dir: string;
  private stateBranch: StateBranchService;

  constructor(mark2Dir?: string, stateBranch?: StateBranchService, localOnly: boolean = false) {
    this.mark2Dir = mark2Dir ?? getMark2Dir();
    this.stateBranch = stateBranch ?? new StateBranchService(this.mark2Dir, localOnly);
  }

  async create(data: {
    title: string;
    prompt: string;
    created_by: string;
  }): Promise<Plan> {
    const now = new Date().toISOString();
    const id = generatePlanId(this.mark2Dir);

    const plan = PlanSchema.parse({
      id,
      title: data.title,
      prompt: data.prompt,
      phase: 'prompt',
      artifacts: [],
      proposed_stories: [],
      created_stories: [],
      created_tasks: [],
      created_by: data.created_by,
      created_at: now,
      updated_at: now,
      phase_entered_at: now,
    });

    // Write to state branch
    await this.stateBranch.writeYaml(`plans/${plan.id}.yaml`, plan);

    // Ensure storage directory exists
    const storageDir = path.join(this.mark2Dir, 'storage', plan.id, 'artifacts');
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    // Update SQLite
    const db = getDb(this.mark2Dir);
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

    // Push to remote
    await this.stateBranch.push(`Create ${plan.id}: ${plan.title}`);

    return plan;
  }

  getById(planId: string): Plan | null {
    const db = getDb(this.mark2Dir);
    const row = db.select().from(plans).where(eq(plans.id, planId)).get();
    if (!row) return null;
    return this.rowToPlan(row);
  }

  list(filters?: { phase?: string }): Plan[] {
    const db = getDb(this.mark2Dir);
    const conditions: ReturnType<typeof eq>[] = [];

    if (filters?.phase) {
      conditions.push(eq(plans.phase, filters.phase));
    }

    let rows;
    if (conditions.length > 0) {
      rows = db.select().from(plans).where(and(...conditions)).all();
    } else {
      rows = db.select().from(plans).all();
    }

    return rows.map((row) => this.rowToPlan(row));
  }

  async update(planId: string, updates: Partial<Plan>): Promise<Plan> {
    const existing = this.getById(planId);
    if (!existing) {
      throw new Error(`Plan ${planId} not found`);
    }

    const now = new Date().toISOString();
    const merged = {
      ...existing,
      ...updates,
      id: planId,
      updated_at: now,
    };

    const plan = PlanSchema.parse(merged);

    // Write to state branch
    await this.stateBranch.writeYaml(`plans/${plan.id}.yaml`, plan);

    // Update SQLite
    const db = getDb(this.mark2Dir);
    db.update(plans)
      .set({
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
      })
      .where(eq(plans.id, planId))
      .run();

    return plan;
  }

  async delete(planId: string): Promise<void> {
    const plan = this.getById(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    // Delete from state branch
    await this.stateBranch.deleteFile(`plans/${planId}.yaml`);
    await this.stateBranch.push(`Delete ${planId}`);

    // Delete from SQLite
    const db = getDb(this.mark2Dir);
    db.delete(plans).where(eq(plans.id, planId)).run();
  }

  async transitionPhase(planId: string, newPhase: PlanPhase): Promise<Plan> {
    const plan = this.getById(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    const now = new Date().toISOString();
    const updated = await this.update(planId, {
      phase: newPhase,
      phase_entered_at: now,
    });

    await this.stateBranch.push(`${planId}: ${plan.phase} → ${newPhase}`);

    return updated;
  }

  async addArtifact(planId: string, artifact: PlanArtifact): Promise<Plan> {
    const plan = this.getById(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    const updated = await this.update(planId, {
      artifacts: [...plan.artifacts, artifact],
    });

    return updated;
  }

  private rowToPlan(row: typeof plans.$inferSelect): Plan {
    return {
      id: row.id,
      title: row.title,
      prompt: row.prompt,
      phase: row.phase as Plan['phase'],
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      phase_entered_at: row.phase_entered_at,
      artifacts: JSON.parse(row.artifacts_json),
      proposed_stories: JSON.parse(row.proposed_stories_json),
      created_stories: JSON.parse(row.created_stories_json),
      created_tasks: JSON.parse(row.created_tasks_json),
      project_prefix: row.project_prefix ?? undefined,
    };
  }
}
