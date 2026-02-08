import type { Plan } from '../../yaml/schemas';
import { PlanEngine, type PlanEngineConfig } from '../plan-engine';

export async function handleTaskGeneration(
  plan: Plan,
  config: PlanEngineConfig,
  feedback?: string,
): Promise<{ tmuxSession: string }> {
  const engine = new PlanEngine(config);
  return engine.startPhase(plan.id, 'task_generation', feedback);
}
