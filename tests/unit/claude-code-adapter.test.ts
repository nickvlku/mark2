import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { ClaudeCodeAdapter } from '@/lib/adapters/claude-code';
import type { AgentInvocationParams } from '@/types';

function extractQuotedFlag(command: string, flag: string): string {
  const escapedFlag = flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = command.match(new RegExp(`${escapedFlag} '([^']*)'`));
  if (!match) {
    throw new Error(`Could not find flag ${flag} in command`);
  }
  return match[1];
}

describe('ClaudeCodeAdapter', () => {
  const originalHome = process.env.HOME;
  const tempPaths: string[] = [];

  afterEach(() => {
    process.env.HOME = originalHome;
    for (const p of tempPaths.splice(0)) {
      rmSync(p, { recursive: true, force: true });
    }
  });

  it('creates Claude project memory directories for both cwd slug variants', () => {
    const homeDir = mkdtempSync(path.join(os.tmpdir(), 'mark2-home-'));
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'mark2-project-'));
    tempPaths.push(homeDir, projectRoot);
    process.env.HOME = homeDir;

    const workingDirectory = path.join(projectRoot, '.mark2', 'clones', 'TASK-321');
    fs.mkdirSync(workingDirectory, { recursive: true });

    const adapter = new ClaudeCodeAdapter();
    const params: AgentInvocationParams = {
      prompt: 'fallback prompt',
      taskPrompt: 'task prompt',
      orchestrationPrompt: 'orchestration prompt',
      agentPrompt: 'agent prompt',
      workingDirectory,
      agentName: 'expert-system-architect',
      model: 'claude-sonnet-4-20250514',
      taskId: 'TASK-321',
      phase: 'design',
      apiBaseUrl: 'http://localhost:3100',
      agentToken: 'mark2-local',
      timeoutMinutes: 20,
    };

    const command = adapter.buildCommand(params);
    expect(command).toContain('--append-system-prompt');
    expect(command).toContain('--agents');
    expect(command).toContain('--agent mark2-design');

    const normalizedCwd = path.resolve(workingDirectory).replace(/\\/g, '/');
    const slashOnlySlug = normalizedCwd.replace(/\//g, '-');
    const slashDotSlug = normalizedCwd.replace(/[/.]/g, '-');

    const slashOnlyMemory = path.join(homeDir, '.claude', 'projects', slashOnlySlug, 'memory');
    const slashDotMemory = path.join(homeDir, '.claude', 'projects', slashDotSlug, 'memory');

    expect(fs.existsSync(slashOnlyMemory)).toBe(true);
    expect(fs.existsSync(slashDotMemory)).toBe(true);
  });

  it('builds mcp config with mark2 server and writes hook/prompt files', () => {
    const homeDir = mkdtempSync(path.join(os.tmpdir(), 'mark2-home-'));
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'mark2-project-'));
    tempPaths.push(homeDir, projectRoot);
    process.env.HOME = homeDir;

    const workingDirectory = path.join(projectRoot, '.mark2', 'clones', 'TASK-654');
    fs.mkdirSync(workingDirectory, { recursive: true });

    const adapter = new ClaudeCodeAdapter();
    const params: AgentInvocationParams = {
      prompt: 'fallback prompt',
      taskPrompt: 'task prompt text',
      orchestrationPrompt: 'orchestration text',
      agentPrompt: 'agent text',
      workingDirectory,
      agentName: 'expert-system-architect',
      model: 'claude-sonnet-4-20250514',
      taskId: 'TASK-654',
      phase: 'design',
      apiBaseUrl: 'http://localhost:3100',
      agentToken: 'mark2-local',
      timeoutMinutes: 20,
    };

    const command = adapter.buildCommand(params);
    const mcpConfigJson = extractQuotedFlag(command, '--mcp-config');
    const mcpConfig = JSON.parse(mcpConfigJson);
    const mark2Server = mcpConfig.mcpServers.mark2;

    expect(mark2Server.command).toBe(path.join(process.cwd(), 'node_modules', '.bin', 'tsx'));
    expect(mark2Server.args).toEqual([path.join(process.cwd(), 'src', 'lib', 'mcp', 'index.ts')]);
    expect(mark2Server.env.MARK2_DIR).toBe(path.join(projectRoot, '.mark2'));
    expect(mark2Server.env.MARK2_TASK_ID).toBe('TASK-654');
    expect(mark2Server.env.MARK2_PROJECT_ROOT).toBe(projectRoot);
    expect(mark2Server.env.MARK2_API_URL).toBe('http://localhost:3100');

    const settingsPath = path.join(workingDirectory, '.claude', 'settings.local.json');
    expect(fs.existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(settings.hooks.Stop[0].hooks[0].type).toBe('command');
    expect(settings.hooks.Stop[0].hooks[0].command).toContain('cli/hooks/end-token-hook.ts');

    const promptsDir = path.join(projectRoot, '.mark2', 'storage', 'TASK-654', 'prompts');
    expect(fs.readFileSync(path.join(promptsDir, 'design-task.md'), 'utf-8')).toBe('task prompt text');
    expect(fs.readFileSync(path.join(promptsDir, 'design-orchestration.md'), 'utf-8')).toBe('orchestration text');
    expect(fs.readFileSync(path.join(promptsDir, 'design-agent.md'), 'utf-8')).toBe('agent text');
  });
});
