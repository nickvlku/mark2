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

  it('returns environment variables including storage paths', () => {
    const adapter = new CodexCLIAdapter();
    const workingDirectory = '/tmp/project/.mark2/clones/TASK-999';
    const params = createTestParams({ workingDirectory });
    const env = adapter.getEnvironment(params);

    // Core variables
    expect(env.MARK2_TASK_ID).toBe('TASK-999');
    expect(env.MARK2_API_URL).toBe('http://localhost:3100');
    expect(env.MARK2_AGENT_TOKEN).toBe('mark2-local');
    expect(env.NODE_ENV).toBe('development');

    // Storage path variables
    expect(env.MARK2_STORAGE_DIR).toBe('/tmp/project/.mark2/storage/TASK-999');
    expect(env.MARK2_ARTIFACTS_DIR).toBe('/tmp/project/.mark2/storage/TASK-999/artifacts');
    expect(env.MARK2_PROMPTS_DIR).toBe('/tmp/project/.mark2/storage/TASK-999/prompts');
    expect(env.MARK2_SESSIONS_DIR).toBe('/tmp/project/.mark2/storage/TASK-999/sessions');
  });

  it('returns storage paths with fallback project root', () => {
    const adapter = new CodexCLIAdapter();
    const params = createTestParams({ workingDirectory: '/tmp/some-project' });
    const env = adapter.getEnvironment(params);

    expect(env.MARK2_STORAGE_DIR).toBe('/tmp/some-project/.mark2/storage/TASK-999');
    expect(env.MARK2_ARTIFACTS_DIR).toBe('/tmp/some-project/.mark2/storage/TASK-999/artifacts');
  });

  it('returns storage paths for worktree pattern', () => {
    const adapter = new CodexCLIAdapter();
    const workingDirectory = '/tmp/project/.worktrees/TASK-999/coding';
    const params = createTestParams({ workingDirectory });
    const env = adapter.getEnvironment(params);

    // Should extract project root from .worktrees path
    expect(env.MARK2_STORAGE_DIR).toBe('/tmp/project/.mark2/storage/TASK-999');
    expect(env.MARK2_ARTIFACTS_DIR).toBe('/tmp/project/.mark2/storage/TASK-999/artifacts');
    expect(env.MARK2_PROMPTS_DIR).toBe('/tmp/project/.mark2/storage/TASK-999/prompts');
    expect(env.MARK2_SESSIONS_DIR).toBe('/tmp/project/.mark2/storage/TASK-999/sessions');
  });

  it('handles working directory with trailing slash', () => {
    const adapter = new CodexCLIAdapter();
    const workingDirectory = '/tmp/project/.mark2/clones/TASK-999/';
    const params = createTestParams({ workingDirectory });
    const env = adapter.getEnvironment(params);

    // Should handle trailing slash correctly
    expect(env.MARK2_STORAGE_DIR).toBe('/tmp/project/.mark2/storage/TASK-999');
    expect(env.MARK2_ARTIFACTS_DIR).toBe('/tmp/project/.mark2/storage/TASK-999/artifacts');
  });

  describe('cleanup', () => {
    it('deletes .codex/config.toml', async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'codex-cleanup-'));
      tempPaths.push(tmpDir);

      // Setup: create .codex/config.toml
      fs.mkdirSync(path.join(tmpDir, '.codex'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '.codex', 'config.toml'), '[mcp]');

      const adapter = new CodexCLIAdapter();
      await adapter.cleanup(tmpDir);

      expect(fs.existsSync(path.join(tmpDir, '.codex', 'config.toml'))).toBe(false);
    });

    it('deletes AGENTS.md', async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'codex-cleanup-'));
      tempPaths.push(tmpDir);

      // Setup: create AGENTS.md
      fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agent Instructions');

      const adapter = new CodexCLIAdapter();
      await adapter.cleanup(tmpDir);

      expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(false);
    });

    it('removes empty .codex directory', async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'codex-cleanup-'));
      tempPaths.push(tmpDir);

      // Setup: create .codex/config.toml
      fs.mkdirSync(path.join(tmpDir, '.codex'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '.codex', 'config.toml'), '[mcp]');

      const adapter = new CodexCLIAdapter();
      await adapter.cleanup(tmpDir);

      expect(fs.existsSync(path.join(tmpDir, '.codex'))).toBe(false);
    });

    it('preserves .codex directory when not empty', async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'codex-cleanup-'));
      tempPaths.push(tmpDir);

      // Setup: create .codex/config.toml and an extra file
      fs.mkdirSync(path.join(tmpDir, '.codex'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '.codex', 'config.toml'), '[mcp]');
      fs.writeFileSync(path.join(tmpDir, '.codex', 'other-file.txt'), 'keep me');

      const adapter = new CodexCLIAdapter();
      await adapter.cleanup(tmpDir);

      // Directory should still exist
      expect(fs.existsSync(path.join(tmpDir, '.codex'))).toBe(true);
      // config.toml should be deleted
      expect(fs.existsSync(path.join(tmpDir, '.codex', 'config.toml'))).toBe(false);
      // other file should remain
      expect(fs.existsSync(path.join(tmpDir, '.codex', 'other-file.txt'))).toBe(true);
    });

    it('is idempotent (no error when files missing)', async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'codex-cleanup-'));
      tempPaths.push(tmpDir);

      const adapter = new CodexCLIAdapter();

      // Call cleanup on empty directory - should not throw
      await expect(adapter.cleanup(tmpDir)).resolves.toBeUndefined();
    });

    it('handles all files missing gracefully', async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'codex-cleanup-'));
      tempPaths.push(tmpDir);

      const adapter = new CodexCLIAdapter();

      // Call cleanup multiple times - should be safe
      await adapter.cleanup(tmpDir);
      await adapter.cleanup(tmpDir);
      await adapter.cleanup(tmpDir);

      // No assertion needed - test passes if no exception thrown
    });

    it('deletes both files and removes directory in one call', async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'codex-cleanup-'));
      tempPaths.push(tmpDir);

      // Setup: create both config.toml and AGENTS.md
      fs.mkdirSync(path.join(tmpDir, '.codex'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '.codex', 'config.toml'), '[mcp]');
      fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agent Instructions');

      const adapter = new CodexCLIAdapter();
      await adapter.cleanup(tmpDir);

      // All should be gone
      expect(fs.existsSync(path.join(tmpDir, '.codex', 'config.toml'))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, '.codex'))).toBe(false);
    });

    it('handles partial cleanup (only some files exist)', async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'codex-cleanup-'));
      tempPaths.push(tmpDir);

      // Setup: only create AGENTS.md, not .codex/config.toml
      fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agent Instructions');

      const adapter = new CodexCLIAdapter();
      await adapter.cleanup(tmpDir);

      // AGENTS.md should be deleted
      expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(false);
      // .codex directory should not exist (and that's fine)
      expect(fs.existsSync(path.join(tmpDir, '.codex'))).toBe(false);
    });
  });
});
