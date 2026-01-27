import { NextResponse } from 'next/server';
import { BakeoffService } from '@/lib/services/bakeoff-service';
import { Phase } from '@/lib/yaml/schemas';
import path from 'path';

const projectRoot = process.cwd();
const mark2Dir = path.join(projectRoot, '.mark2');
const service = new BakeoffService(projectRoot, mark2Dir);

export { service as bakeoffService };

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.task_id || !body.agents || !body.phase) {
      return NextResponse.json(
        { error: 'task_id, agents, and phase are required' },
        { status: 400 },
      );
    }

    if (!Array.isArray(body.agents) || body.agents.length < 2) {
      return NextResponse.json(
        { error: 'agents must be an array with at least 2 entries' },
        { status: 400 },
      );
    }

    // Validate phase
    const phaseResult = Phase.safeParse(body.phase);
    if (!phaseResult.success) {
      return NextResponse.json(
        { error: `Invalid phase: ${body.phase}` },
        { status: 400 },
      );
    }

    const bakeoffId = await service.start({
      taskId: body.task_id,
      agents: body.agents,
      phase: phaseResult.data,
    });

    return NextResponse.json({ bakeoff_id: bakeoffId }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to start bake-off';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
