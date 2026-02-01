import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export async function stopCommand(projectDir: string = process.cwd()): Promise<void> {
  const mark2Dir = path.join(projectDir, '.mark2');
  const pidFile = path.join(mark2Dir, 'server.pid');

  if (fs.existsSync(pidFile)) {
    try {
      const { pid, port } = JSON.parse(fs.readFileSync(pidFile, 'utf-8'));
      try {
        process.kill(pid, 0);
        process.kill(pid, 'SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
        try { process.kill(pid, 0); process.kill(pid, 'SIGKILL'); } catch {}
      } catch {}
      fs.unlinkSync(pidFile);
      console.log(`Mark2 stopped (was PID ${pid})`);
      return;
    } catch {
      try { fs.unlinkSync(pidFile); } catch {}
    }
  }

  // Fallback
  try {
    const { stdout } = await execAsync('pgrep -f "tsx.*server.ts"');
    const pids = stdout.trim().split('\n').filter(Boolean);
    for (const pid of pids) {
      try { await execAsync(`kill ${pid}`); } catch {}
    }
    console.log('Mark2 stopped');
  } catch {
    console.log('Mark2 not running');
  }
}
