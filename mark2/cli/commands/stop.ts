import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function stopCommand(): Promise<void> {
  console.log('Stopping Mark2 server...');

  try {
    // Find processes running server.ts
    const { stdout } = await execAsync('pgrep -f "tsx.*server.ts"');
    const pids = stdout.trim().split('\n').filter(Boolean);

    if (pids.length === 0) {
      console.log('No Mark2 server processes found.');
      return;
    }

    // Kill each process
    for (const pid of pids) {
      try {
        await execAsync(`kill ${pid}`);
        console.log(`Terminated process ${pid}`);
      } catch (error) {
        console.warn(`Failed to kill process ${pid}:`, error);
      }
    }

    // Wait a moment and check if processes are still running
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      const { stdout: remainingProcesses } = await execAsync('pgrep -f "tsx.*server.ts"');
      if (remainingProcesses.trim()) {
        console.log('Some processes may still be running. Trying force kill...');
        const remainingPids = remainingProcesses.trim().split('\n').filter(Boolean);
        for (const pid of remainingPids) {
          try {
            await execAsync(`kill -9 ${pid}`);
            console.log(`Force killed process ${pid}`);
          } catch (error) {
            console.warn(`Failed to force kill process ${pid}:`, error);
          }
        }
      }
    } catch {
      // No remaining processes found, which is good
    }

    console.log('Mark2 server stopped.');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Command failed')) {
      console.log('No Mark2 server processes found.');
    } else {
      console.error('Error stopping Mark2 server:', error);
      process.exit(1);
    }
  }
}