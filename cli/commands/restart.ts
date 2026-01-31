const API_BASE = `http://localhost:${process.env.PORT || 3100}`;

export async function restartCommand(taskId: string, phase?: string): Promise<void> {
  if (!taskId) {
    console.error('Usage: mark2 restart <taskId> [phase]');
    process.exit(1);
  }

  try {
    if (phase) {
      // Transition to specified phase
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}/phase`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error(`Error: ${data.error}`);
        process.exit(1);
      }
      console.log(`Transitioned ${taskId} to phase: ${phase}`);
    } else {
      // Restart current phase
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}/phase/restart`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        console.error(`Error: ${data.error}`);
        process.exit(1);
      }
      console.log(`Restarted phase "${data.restarted_phase}" for ${taskId}`);
    }
  } catch (err: any) {
    console.error(`Failed to connect to Mark2 server at ${API_BASE}`);
    console.error('Is the server running? Start it with: mark2 start');
    process.exit(1);
  }
}
