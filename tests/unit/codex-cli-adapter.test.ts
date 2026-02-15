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
});
