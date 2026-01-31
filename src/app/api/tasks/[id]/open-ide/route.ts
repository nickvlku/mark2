import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { CloneService } from '@/lib/services/clone-service';
import { TaskService } from '@/lib/services/task-service';
import { ConfigService } from '@/lib/services/config-service';

const execAsync = promisify(exec);
const taskService = new TaskService();
const cloneService = new CloneService();
const configService = new ConfigService();

async function tryOpenIDE(command: string, path: string): Promise<boolean> {
  try {
    // First check if the command exists
    await execAsync(`which ${command}`);
    // Then open the path
    await execAsync(`${command} "${path}"`);
    return true;
  } catch {
    return false;
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

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
      const success = await tryOpenIDE(ideCommand, clonePath);
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
