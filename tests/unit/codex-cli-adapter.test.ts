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
    expect(adapter.supportsMCP).toBe(false);  // Will change to true in TASK-66
    expect(adapter.supportsNaming).toBe(false);
  });

  it('builds basic codex command', () => {
    const adapter = new CodexCLIAdapter();
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
    tempPaths.push(tmpDir);

    const params = createTestParams({ workingDirectory: tmpDir });
    const command = adapter.buildCommand(params);
    expect(command).toContain('codex');
    expect(command).toContain('--full-auto');
    expect(command).toContain('--model');
    expect(command).toContain('gpt-5.2-codex');
    expect(command).toContain('--ask-for-approval');
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

  it('creates MCP config file', () => {
    const adapter = new CodexCLIAdapter();
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
    tempPaths.push(tmpDir);

    const params = createTestParams({ workingDirectory: tmpDir });
    adapter.buildCommand(params);

    const mcpConfigPath = path.join(tmpDir, '.codex', 'mcp-config.json');
    expect(fs.existsSync(mcpConfigPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));
    expect(config.taskId).toBe('TASK-999');
    expect(config.apiBaseUrl).toBe('http://localhost:3100');
    expect(config.mcpServers).toBeDefined();
  });

  it('creates AGENTS.md file', () => {
    const adapter = new CodexCLIAdapter();
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
    tempPaths.push(tmpDir);

    const params = createTestParams({
      workingDirectory: tmpDir,
      agentName: 'test-agent',
      agentPrompt: 'You are a test agent',
      taskPrompt: 'Complete the test',
    });
    adapter.buildCommand(params);

    const agentsMdPath = path.join(tmpDir, 'AGENTS.md');
    expect(fs.existsSync(agentsMdPath)).toBe(true);

    const content = fs.readFileSync(agentsMdPath, 'utf-8');
    expect(content).toContain('test-agent');
    expect(content).toContain('TASK-999');
    expect(content).toContain('You are a test agent');
    expect(content).toContain('Complete the test');
  });

  it('handles shell quoting with special characters', () => {
    const adapter = new CodexCLIAdapter();
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
    tempPaths.push(tmpDir);

    const params = createTestParams({
      workingDirectory: tmpDir,
      prompt: "Test with 'single quotes' and \"double quotes\"",
      model: "gpt-4'test",
    });
    const command = adapter.buildCommand(params);

    // Should properly escape single quotes
    expect(command).toContain("'gpt-4'\\''test'");
    expect(command).toContain("'Test with '\\''single quotes'\\'' and \"double quotes\"'");
  });
});
