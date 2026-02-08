import type { Plan } from '../../yaml/schemas';
import { PlanEngine, type PlanEngineConfig } from '../plan-engine';

export async function handleTechSpec(
  plan: Plan,
  config: PlanEngineConfig,
  feedback?: string,
): Promise<{ tmuxSession: string }> {
  const engine = new PlanEngine(config);
  return engine.startPhase(plan.id, 'tech_spec', feedback);
}
