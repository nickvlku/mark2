import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { CodexCLIAdapter } from '@/lib/adapters/codex-cli';
import type { AgentInvocationParams } from '@/types';

// Helper to create standard test params
function createTestParams(overrides?: Partial<AgentInvocationParams>): AgentInvocationParams {
  return {
    prompt: 'test prompt',
    taskPrompt: 'task prompt',
    orchestrationPrompt: 'orchestration prompt',
    agentPrompt: 'agent prompt',
    workingDirectory: '/tmp/test-workdir',
    agentName: 'test-agent',
    model: 'gpt-5.2-codex',
    taskId: 'TASK-999',
    phase: 'coding',
    apiBaseUrl: 'http://localhost:3100',
    agentToken: 'mark2-local',
    timeoutMinutes: 20,
    ...overrides,
  };
}

describe('CodexCLIAdapter', () => {
  const tempPaths: string[] = [];

  afterEach(() => {
    for (const p of tempPaths.splice(0)) {
      rmSync(p, { recursive: true, force: true });
    }
  });

  it('has correct static properties', () => {
    const adapter = new CodexCLIAdapter();
    expect(adapter.toolId).toBe('codex-cli');
    expect(adapter.supportsMCP).toBe(true);
    expect(adapter.supportsNaming).toBe(false);
  });

  it('builds basic codex command', () => {
    const adapter = new CodexCLIAdapter();
    const params = createTestParams();
    const command = adapter.buildCommand(params);
    expect(command).toContain('codex');
    expect(command).toContain('--full-auto');
    expect(command).toContain('--model');
    expect(command).toContain('gpt-5.2-codex');
  });

  it('returns environment variables', () => {
    const adapter = new CodexCLIAdapter();
    const params = createTestParams();
    const env = adapter.getEnvironment(params);
    expect(env.MARK2_TASK_ID).toBe('TASK-999');
    expect(env.MARK2_API_URL).toBe('http://localhost:3100');
    expect(env.MARK2_AGENT_TOKEN).toBe('mark2-local');
    expect(env.NODE_ENV).toBe('development');
  });

  it('generates .codex/config.toml with mark2 MCP server', () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'mark2-project-'));
    tempPaths.push(projectRoot);

    const workingDirectory = path.join(projectRoot, '.mark2', 'clones', 'TASK-999');
    fs.mkdirSync(workingDirectory, { recursive: true });

    const adapter = new CodexCLIAdapter();
    const params = createTestParams({ workingDirectory });
    adapter.buildCommand(params);

    const configPath = path.join(workingDirectory, '.codex', 'config.toml');
    expect(fs.existsSync(configPath)).toBe(true);

    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain('[mcp_servers.mark2]');
    expect(content).toContain('command =');
    expect(content).toContain('[mcp_servers.mark2.env]');
    expect(content).toContain('MARK2_TASK_ID = "TASK-999"');
    expect(content).toContain('MARK2_PROJECT_ROOT =');
    expect(content).toContain('MARK2_API_URL = "http://localhost:3100"');
  });

  it('creates .codex directory if it does not exist', () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'mark2-project-'));
    tempPaths.push(projectRoot);

    const workingDirectory = path.join(projectRoot, '.mark2', 'clones', 'TASK-999');
    fs.mkdirSync(workingDirectory, { recursive: true });

    const adapter = new CodexCLIAdapter();
    const params = createTestParams({ workingDirectory });
    adapter.buildCommand(params);

    expect(fs.existsSync(path.join(workingDirectory, '.codex'))).toBe(true);
  });

  it('returns extended environment variables with storage paths', () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'mark2-project-'));
    tempPaths.push(projectRoot);

    const workingDirectory = path.join(projectRoot, '.mark2', 'clones', 'TASK-999');
    fs.mkdirSync(workingDirectory, { recursive: true });

    const adapter = new CodexCLIAdapter();
    const params = createTestParams({ workingDirectory });
    const env = adapter.getEnvironment(params);

    expect(env.MARK2_STORAGE_DIR).toBeDefined();
    expect(env.MARK2_ARTIFACTS_DIR).toBeDefined();
    expect(env.MARK2_PROMPTS_DIR).toBeDefined();
    expect(env.MARK2_SESSIONS_DIR).toBeDefined();
  });
});
