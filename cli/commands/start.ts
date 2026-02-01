import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface StartOptions {
  foreground?: boolean;
  logs?: boolean;
  logfile?: string;
}

function getMark2InstallDir(): string {
  const p = path.join(__dirname, '..', '..');
  if (fs.existsSync(path.join(p, 'server.ts'))) return p;
  return p;
}

function readConfig(mark2Dir: string): Record<string, any> {
  const configPath = path.join(mark2Dir, 'config.yaml');
  try { return YAML.parse(fs.readFileSync(configPath, 'utf-8')) || {}; }
  catch { return {}; }
}

function findRunningProcess(mark2Dir: string): { pid: number; port: number } | null {
  const pidFile = path.join(mark2Dir, 'server.pid');
  if (!fs.existsSync(pidFile)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(pidFile, 'utf-8'));
    process.kill(data.pid, 0);
    return data;
  } catch {
    try { fs.unlinkSync(pidFile); } catch {}
    return null;
  }
}

export async function startCommand(
  projectDir: string = process.cwd(),
  options: StartOptions = {}
): Promise<void> {
  const mark2Dir = path.join(projectDir, '.mark2');

  if (!fs.existsSync(mark2Dir)) {
    console.error('Error: .mark2 not found. Run `mark2 init` first.');
    process.exit(1);
  }

  const config = readConfig(mark2Dir);
  const port = config.server_port || 3100;
  const existing = findRunningProcess(mark2Dir);

  if (options.logs) {
    const logPath = path.join(mark2Dir, 'server.log');
    if (!fs.existsSync(logPath)) {
      console.error('No log file found.');
      process.exit(1);
    }
    const tail = spawn('tail', ['-f', logPath], { stdio: 'inherit' });
    process.on('SIGINT', () => { tail.kill(); process.exit(0); });
    return;
  }

  if (existing) {
    console.log(`Mark2 already running on http://localhost:${existing.port} (PID ${existing.pid})`);
    return;
  }

  const installDir = getMark2InstallDir();
  const serverPath = path.join(installDir, 'server.ts');

  if (!fs.existsSync(serverPath)) {
    console.error(`Error: server.ts not found at ${serverPath}`);
    process.exit(1);
  }

  const env = {
    ...process.env,
    MARK2_DIR: mark2Dir,
    MARK2_PROJECT_DIR: projectDir,
    PORT: String(port),
  };

  if (options.foreground) {
    console.log(`Starting on port ${port}...`);
    const child = spawn('npx', ['tsx', serverPath], { cwd: installDir, stdio: 'inherit', env });
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    for (const sig of signals) process.on(sig, () => child.kill(sig));
    child.on('exit', (code) => process.exit(code ?? 0));
    child.on('error', (err) => { console.error('Failed:', err.message); process.exit(1); });
    return;
  }

  const logPath = options.logfile || path.join(mark2Dir, 'server.log');
  const logStream = fs.openSync(logPath, 'a');

  const child = spawn('npx', ['tsx', serverPath], {
    cwd: installDir, detached: true,
    stdio: ['ignore', logStream, logStream], env,
  });

  fs.writeFileSync(path.join(mark2Dir, 'server.pid'), JSON.stringify({ pid: child.pid, port }));
  child.unref();

  console.log(`Mark2 started on http://localhost:${port} (PID ${child.pid})`);
}
