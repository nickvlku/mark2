import { NextResponse } from 'next/server';
import { spawnSync } from 'child_process';
import { createCloneService, createTaskService, createConfigService } from '@/lib/services/factory';
import { isValidTaskId } from '@/lib/utils/route-validation';

const taskService = createTaskService();
const cloneService = createCloneService();
const configService = createConfigService();

function tryOpenIDE(command: string, clonePath: string): boolean {
  const whichResult = spawnSync('which', [command], { encoding: 'utf-8' });
  if (whichResult.status !== 0) return false;
  const result = spawnSync(command, [clonePath], { stdio: 'inherit' });
  return result.status === 0;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidTaskId(id)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }

    const task = taskService.getById(id);
    if (!task) {
      return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
    }

    if (!cloneService.cloneExists(id)) {
      return NextResponse.json(
        { error: 'No clone exists for this task' },
        { status: 400 },
      );
    }

    const clonePath = cloneService.getClonePath(id);
    const config = configService.get();
    const ideCommands = config.ide_commands || ['code', 'cursor', 'windsurf'];

    // Try each IDE command in order until one succeeds
    for (const ideCommand of ideCommands) {
      const success = tryOpenIDE(ideCommand, clonePath);
      if (success) {
        return NextResponse.json({
          success: true,
          clonePath,
          ideCommand,
        });
      }
    }

    return NextResponse.json(
      { error: `No IDE found. Tried: ${ideCommands.join(', ')}` },
      { status: 400 },
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to open IDE' },
      { status: 500 },
    );
  }
}
