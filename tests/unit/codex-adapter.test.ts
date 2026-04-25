import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { CodexCLIAdapter } from '@/lib/adapters/codex-cli';
import type { AgentInvocationParams } from '@/types';

function createTestParams(
  overrides: Partial<AgentInvocationParams> = {},
): AgentInvocationParams {
  return {
    prompt: 'full prompt',
    taskPrompt: 'test prompt',
    orchestrationPrompt: 'orchestration prompt',
    agentPrompt: 'agent prompt',
    workingDirectory: '/tmp/project/.mark2/clones/TASK-999',
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

function createTempClone(taskId = 'TASK-999') {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-adapter-'));
  const workingDirectory = path.join(tempDir, '.mark2', 'clones', taskId);

  fs.mkdirSync(path.join(workingDirectory, '.git', 'info'), { recursive: true });

  return { tempDir, workingDirectory };
}

describe('CodexCLIAdapter basic contract', () => {
  const originalHome = process.env.HOME;
  const tempPaths: string[] = [];

  afterEach(() => {
    process.env.HOME = originalHome;

    for (const tempPath of tempPaths.splice(0)) {
      fs.rmSync(tempPath, { recursive: true, force: true });
    }
  });

  it('exposes the expected tool identity and capabilities', () => {
    const adapter = new CodexCLIAdapter();

    expect(adapter.toolId).toBe('codex-cli');
    expect(adapter.supportsMCP).toBe(true);
    expect(adapter.supportsNaming).toBe(false);
  });

  it('returns the expected Mark2 environment variables', () => {
    const adapter = new CodexCLIAdapter();
    const params = createTestParams({
      workingDirectory: '/tmp/project/.mark2/clones/TASK-999',
    });

    expect(adapter.getEnvironment(params)).toEqual({
      NODE_ENV: 'development',
      MARK2_AGENT_TOKEN: 'mark2-local',
      MARK2_API_URL: 'http://localhost:3100',
      MARK2_TASK_ID: 'TASK-999',
      MARK2_STORAGE_DIR: '/tmp/project/.mark2/storage/TASK-999',
      MARK2_ARTIFACTS_DIR: '/tmp/project/.mark2/storage/TASK-999/artifacts',
      MARK2_PROMPTS_DIR: '/tmp/project/.mark2/storage/TASK-999/prompts',
      MARK2_SESSIONS_DIR: '/tmp/project/.mark2/storage/TASK-999/sessions',
    });
  });

  it('shell-quotes model and task prompt special characters', () => {
    const adapter = new CodexCLIAdapter();
    const { tempDir, workingDirectory } = createTempClone();
    tempPaths.push(tempDir);
    process.env.HOME = tempDir;

    const command = adapter.buildCommand(
      createTestParams({
        workingDirectory,
        model: "gpt-4'test",
        taskPrompt: `Test with 'single quotes' and "double quotes"`,
      }),
    );

    expect(command).toContain("'gpt-4'\\''test'");
    expect(command).toContain(
      `'Test with '\\''single quotes'\\'' and "double quotes"'`,
    );
  });

  it('returns undefined for prompt file handoff', () => {
    const adapter = new CodexCLIAdapter();

    expect(adapter.getPromptFilePath(createTestParams())).toBeUndefined();
  });
});
