import path from 'path';
import fs from 'fs';
import YAML from 'yaml';
import { listMark2Sessions } from '../../src/lib/utils/tmux';

function readConfig(mark2Dir: string): Record<string, any> {
  const configPath = path.join(mark2Dir, 'config.yaml');
  try { return YAML.parse(fs.readFileSync(configPath, 'utf-8')) || {}; }
  catch { return {}; }
}

function getStats(mark2Dir: string): { tasks: number; activeTasks: number } {
  let tasks = 0, activeTasks = 0;
  const tasksDir = path.join(mark2Dir, 'tasks');

  if (fs.existsSync(tasksDir)) {
    const files = fs.readdirSync(tasksDir).filter(f => f.endsWith('.yaml') && !f.includes('.activity'));
    tasks = files.length;
    for (const file of files) {
      try {
        const content = YAML.parse(fs.readFileSync(path.join(tasksDir, file), 'utf-8'));
        if (content?.status && !['done', 'archived'].includes(content.status)) activeTasks++;
      } catch {}
    }
  }
  return { tasks, activeTasks };
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

export async function statusCommand(projectDir: string = process.cwd()): Promise<void> {
  const mark2Dir = path.join(projectDir, '.mark2');

  if (!fs.existsSync(mark2Dir)) {
    console.error('Error: .mark2 not found. Run `mark2 init` first.');
    process.exit(1);
  }

  const config = readConfig(mark2Dir);
  const projectName = config.project_name || path.basename(projectDir);
  const stats = getStats(mark2Dir);
  const running = findRunningProcess(mark2Dir);
  const sessions = await listMark2Sessions();

  if (running) {
    console.log(`Mark2 running on http://localhost:${running.port} (PID ${running.pid})`);
  } else {
    console.log('Mark2 not running');
  }
  console.log(`Project: ${projectName}`);
  console.log(`Tasks: ${stats.tasks} total, ${stats.activeTasks} active`);
  if (sessions.length > 0) {
    console.log(`Agents: ${sessions.length} active`);
  }
}
