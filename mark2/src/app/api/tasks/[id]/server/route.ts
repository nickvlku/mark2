import { NextResponse } from 'next/server';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { getDb, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { PortService } from '@/lib/services/port-service';
import { TaskService } from '@/lib/services/task-service';
import { CloneService } from '@/lib/services/clone-service';

const exec = promisify(execCb);

const portService = new PortService();
const taskService = new TaskService();

// Dev server session naming
function devServerSessionName(taskId: string): string {
  return `mark2_${taskId}_devserver`;
}

async function isSessionAlive(sessionName: string): Promise<boolean> {
  try {
    await exec(`tmux has-session -t "${sessionName}"`);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// GET /api/tasks/[id]/server — Get dev server status
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const task = taskService.getById(id);

    if (!task) {
      return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
    }

    const sessionName = devServerSessionName(id);
    const alive = await isSessionAlive(sessionName);

    if (!alive) {
      return NextResponse.json({
        running: false,
        session: null,
        url: null,
        port: null,
      });
    }

    // Get allocated port
    const db = getDb();
    const allocation = db
      .select()
      .from(schema.portAllocations)
      .where(eq(schema.portAllocations.task_id, id))
      .get();

    const ports = allocation ? JSON.parse(allocation.ports_json) : [];
    const services = allocation ? JSON.parse(allocation.services_json) : {};
    const devPort = services.dev || ports[0] || null;

    return NextResponse.json({
      running: true,
      session: sessionName,
      url: devPort ? `http://localhost:${devPort}` : null,
      port: devPort,
      ports,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to get server status' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/tasks/[id]/server — Start dev server
// ---------------------------------------------------------------------------

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const command = body.command || 'npm run dev';

    const task = taskService.getById(id);
    if (!task) {
      return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
    }

    const sessionName = devServerSessionName(id);

    // Check if already running
    if (await isSessionAlive(sessionName)) {
      const db = getDb();
      const allocation = db
        .select()
        .from(schema.portAllocations)
        .where(eq(schema.portAllocations.task_id, id))
        .get();

      const services = allocation ? JSON.parse(allocation.services_json) : {};
      const ports = allocation ? JSON.parse(allocation.ports_json) : [];
      const devPort = services.dev || ports[0];

      return NextResponse.json({
        running: true,
        session: sessionName,
        url: devPort ? `http://localhost:${devPort}` : null,
        port: devPort,
        message: 'Dev server already running',
      });
    }

    // Find the clone path for this task
    const cloneService = new CloneService();
    const clonePath = cloneService.getClonePath(id);

    if (!cloneService.cloneExists(id)) {
      return NextResponse.json(
        { error: `No clone found for task ${id}. Start a phase first to create the clone.` },
        { status: 404 },
      );
    }

    // Allocate port
    const allocation = portService.allocate(id);
    const devPort = allocation.ports[0];

    // Update services to track dev server port
    const db = getDb();
    const services = { ...allocation.services, dev: devPort };
    db.update(schema.portAllocations)
      .set({ services_json: JSON.stringify(services) })
      .where(eq(schema.portAllocations.task_id, id))
      .run();

    // Create tmux session and run dev server
    // Set PORT env var for the dev server
    const envPrefix = `PORT=${devPort}`;
    const fullCommand = `cd "${clonePath}" && ${envPrefix} ${command}`;

    await exec(`tmux new-session -d -s "${sessionName}" -c "${clonePath}"`);
    await exec(`tmux send-keys -t "${sessionName}" ${JSON.stringify(fullCommand)} Enter`);

    // Log activity
    db.insert(schema.activityEntries)
      .values({
        task_id: id,
        timestamp: new Date().toISOString(),
        source: 'system',
        type: 'note',
        message: `Dev server started on port ${devPort}`,
        metadata_json: JSON.stringify({ port: devPort, command, session: sessionName }),
      })
      .run();

    return NextResponse.json({
      running: true,
      session: sessionName,
      url: `http://localhost:${devPort}`,
      port: devPort,
      clone: clonePath,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to start dev server' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/tasks/[id]/server — Stop dev server
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sessionName = devServerSessionName(id);

    // Kill the tmux session
    try {
      await exec(`tmux kill-session -t "${sessionName}"`);
    } catch {
      // Session may not exist
    }

    // Log activity
    const db = getDb();
    db.insert(schema.activityEntries)
      .values({
        task_id: id,
        timestamp: new Date().toISOString(),
        source: 'system',
        type: 'note',
        message: 'Dev server stopped',
        metadata_json: JSON.stringify({ session: sessionName }),
      })
      .run();

    return NextResponse.json({ success: true, message: 'Dev server stopped' });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to stop dev server' },
      { status: 500 },
    );
  }
}
