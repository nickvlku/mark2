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

    // Create a temp directory with .mark2 structure
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
    tempPaths.push(tempDir);
    const workingDir = path.join(tempDir, '.mark2', 'clones', 'TASK-999');
    fs.mkdirSync(workingDir, { recursive: true });

    const params = createTestParams({ workingDirectory: workingDir });
    const env = adapter.getEnvironment(params);

    expect(env.MARK2_TASK_ID).toBe('TASK-999');
    expect(env.MARK2_API_URL).toBe('http://localhost:3100');
    expect(env.MARK2_AGENT_TOKEN).toBe('mark2-local');
    expect(env.NODE_ENV).toBe('development');
    expect(env.MARK2_STORAGE_DIR).toContain('.mark2/storage/TASK-999');
    expect(env.MARK2_ARTIFACTS_DIR).toContain('.mark2/storage/TASK-999/artifacts');
    expect(env.MARK2_PROMPTS_DIR).toContain('.mark2/storage/TASK-999/prompts');
    expect(env.MARK2_SESSIONS_DIR).toContain('.mark2/storage/TASK-999/sessions');
  });

  it('writes AGENTS.md to worktree root', () => {
    const adapter = new CodexCLIAdapter();

    // Create temp directory with .mark2 structure and .git
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
    tempPaths.push(tempDir);
    const workingDir = path.join(tempDir, '.mark2', 'clones', 'TASK-999');
    fs.mkdirSync(workingDir, { recursive: true });
    fs.mkdirSync(path.join(workingDir, '.git', 'info'), { recursive: true });

    const params = createTestParams({ workingDirectory: workingDir });
    adapter.buildCommand(params);

    const agentsMdPath = path.join(workingDir, 'AGENTS.md');
    expect(fs.existsSync(agentsMdPath)).toBe(true);
  });

  it('AGENTS.md contains agent role, orchestration, and MCP tools', () => {
    const adapter = new CodexCLIAdapter();

    // Create temp directory
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
    tempPaths.push(tempDir);
    const workingDir = path.join(tempDir, '.mark2', 'clones', 'TASK-999');
    fs.mkdirSync(workingDir, { recursive: true });
    fs.mkdirSync(path.join(workingDir, '.git', 'info'), { recursive: true });

    const params = createTestParams({
      workingDirectory: workingDir,
      agentPrompt: 'You are a test agent',
      orchestrationPrompt: '# ORCHESTRATION\nTest orchestration instructions',
    });
    adapter.buildCommand(params);

    const agentsMdPath = path.join(workingDir, 'AGENTS.md');
    const content = fs.readFileSync(agentsMdPath, 'utf-8');

    // Check for agent role section
    expect(content).toContain('# Agent Role');
    expect(content).toContain('You are a test agent');

    // Check for orchestration section
    expect(content).toContain('Test orchestration instructions');

    // Check for MCP tools reference
    expect(content).toContain('# Available MCP Tools');
    expect(content).toContain('mark2_signal_complete');
    expect(content).toContain('mark2_save_artifact');
    expect(content).toContain('mark2_git_commit');
  });

  it('writes debug copy to prompts directory', () => {
    const adapter = new CodexCLIAdapter();

    // Create temp directory
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
    tempPaths.push(tempDir);
    const workingDir = path.join(tempDir, '.mark2', 'clones', 'TASK-999');
    fs.mkdirSync(workingDir, { recursive: true });
    fs.mkdirSync(path.join(workingDir, '.git', 'info'), { recursive: true });

    const params = createTestParams({ workingDirectory: workingDir });
    adapter.buildCommand(params);

    const debugPath = path.join(tempDir, '.mark2', 'storage', 'TASK-999', 'prompts', 'coding-agents.md');
    expect(fs.existsSync(debugPath)).toBe(true);

    // Debug copy should match worktree copy
    const worktreeCopy = fs.readFileSync(path.join(workingDir, 'AGENTS.md'), 'utf-8');
    const debugCopy = fs.readFileSync(debugPath, 'utf-8');
    expect(debugCopy).toBe(worktreeCopy);
  });

  it('adds AGENTS.md to git exclude', () => {
    const adapter = new CodexCLIAdapter();

    // Create temp directory
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
    tempPaths.push(tempDir);
    const workingDir = path.join(tempDir, '.mark2', 'clones', 'TASK-999');
    fs.mkdirSync(workingDir, { recursive: true });
    fs.mkdirSync(path.join(workingDir, '.git', 'info'), { recursive: true });

    const params = createTestParams({ workingDirectory: workingDir });
    adapter.buildCommand(params);

    const excludePath = path.join(workingDir, '.git', 'info', 'exclude');
    expect(fs.existsSync(excludePath)).toBe(true);

    const excludeContent = fs.readFileSync(excludePath, 'utf-8');
    expect(excludeContent).toContain('AGENTS.md');
  });

  it('buildCommand uses taskPrompt instead of full prompt', () => {
    const adapter = new CodexCLIAdapter();

    // Create temp directory
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
    tempPaths.push(tempDir);
    const workingDir = path.join(tempDir, '.mark2', 'clones', 'TASK-999');
    fs.mkdirSync(workingDir, { recursive: true });
    fs.mkdirSync(path.join(workingDir, '.git', 'info'), { recursive: true });

    const params = createTestParams({
      workingDirectory: workingDir,
      prompt: 'full prompt with orchestration',
      taskPrompt: 'just the task description',
    });
    const command = adapter.buildCommand(params);

    // Command should contain taskPrompt, not the full prompt
    expect(command).toContain('just the task description');
    expect(command).not.toContain('full prompt with orchestration');
  });

  it('git exclude is idempotent', () => {
    const adapter = new CodexCLIAdapter();

    // Create temp directory
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
    tempPaths.push(tempDir);
    const workingDir = path.join(tempDir, '.mark2', 'clones', 'TASK-999');
    fs.mkdirSync(workingDir, { recursive: true });
    fs.mkdirSync(path.join(workingDir, '.git', 'info'), { recursive: true });

    const params = createTestParams({ workingDirectory: workingDir });

    // Call buildCommand twice
    adapter.buildCommand(params);
    adapter.buildCommand(params);

    const excludePath = path.join(workingDir, '.git', 'info', 'exclude');
    const excludeContent = fs.readFileSync(excludePath, 'utf-8');

    // AGENTS.md should only appear once
    const matches = excludeContent.match(/AGENTS\.md/g);
    expect(matches).toHaveLength(1);
  });

  it('writes individual prompt components for debugging', () => {
    const adapter = new CodexCLIAdapter();

    // Create temp directory
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
    tempPaths.push(tempDir);
    const workingDir = path.join(tempDir, '.mark2', 'clones', 'TASK-999');
    fs.mkdirSync(workingDir, { recursive: true });
    fs.mkdirSync(path.join(workingDir, '.git', 'info'), { recursive: true });

    const params = createTestParams({
      workingDirectory: workingDir,
      phase: 'coding',
      orchestrationPrompt: 'orchestration content',
      agentPrompt: 'agent content',
      taskPrompt: 'task content',
    });
    adapter.buildCommand(params);

    const promptsDir = path.join(tempDir, '.mark2', 'storage', 'TASK-999', 'prompts');

    // Check all three files exist
    expect(fs.existsSync(path.join(promptsDir, 'coding-orchestration.md'))).toBe(true);
    expect(fs.existsSync(path.join(promptsDir, 'coding-agent.md'))).toBe(true);
    expect(fs.existsSync(path.join(promptsDir, 'coding-task.md'))).toBe(true);

    // Check content
    expect(fs.readFileSync(path.join(promptsDir, 'coding-orchestration.md'), 'utf-8')).toBe('orchestration content');
    expect(fs.readFileSync(path.join(promptsDir, 'coding-agent.md'), 'utf-8')).toBe('agent content');
    expect(fs.readFileSync(path.join(promptsDir, 'coding-task.md'), 'utf-8')).toBe('task content');
  });

  it('handles missing orchestration/agent prompts gracefully', () => {
    const adapter = new CodexCLIAdapter();

    // Create temp directory
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
    tempPaths.push(tempDir);
    const workingDir = path.join(tempDir, '.mark2', 'clones', 'TASK-999');
    fs.mkdirSync(workingDir, { recursive: true });
    fs.mkdirSync(path.join(workingDir, '.git', 'info'), { recursive: true });

    const params = createTestParams({
      workingDirectory: workingDir,
      orchestrationPrompt: undefined,
      agentPrompt: undefined,
    });
    adapter.buildCommand(params);

    const agentsMdPath = path.join(workingDir, 'AGENTS.md');
    expect(fs.existsSync(agentsMdPath)).toBe(true);

    const content = fs.readFileSync(agentsMdPath, 'utf-8');
    // Should still contain MCP tools reference
    expect(content).toContain('# Available MCP Tools');
  });
});
