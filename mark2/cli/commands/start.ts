import { exec } from 'child_process';
import path from 'path';

export async function startCommand(projectDir: string = process.cwd()): Promise<void> {
  console.log('Starting Mark2 server...');

  const mark2Dir = path.join(projectDir, '.mark2');

  // Verify .mark2 exists
  const fs = await import('fs');
  if (!fs.existsSync(mark2Dir)) {
    console.error('Error: .mark2 directory not found. Run `mark2 init` first.');
    process.exit(1);
  }

  // Set environment variable for the mark2 directory
  process.env.MARK2_DIR = mark2Dir;
  process.env.MARK2_PROJECT_DIR = projectDir;

  // Run custom server (Next.js + WebSocket)
  const child = exec('npx tsx server.ts', { cwd: __dirname + '/../..' });
  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}
