import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
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
      fs.rmSync(p, { recursive: true, force: true });
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
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
    tempPaths.push(tmpDir);

    const params = createTestParams({ workingDirectory: tmpDir });
    const command = adapter.buildCommand(params);
    expect(command).toContain('codex');
    expect(command).toContain('--approval-mode');
    expect(command).toContain('full-auto');
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

  it('creates MCP config file', () => {
    const adapter = new CodexCLIAdapter();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
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
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
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
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
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

  describe('Shell Quoting Edge Cases', () => {
    it('handles newlines in prompts', () => {
      const adapter = new CodexCLIAdapter();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
      tempPaths.push(tmpDir);

      const params = createTestParams({
        workingDirectory: tmpDir,
        prompt: "Line 1\nLine 2\nLine 3",
      });
      const command = adapter.buildCommand(params);

      // Newlines should be preserved within single quotes
      expect(command).toContain("'Line 1\nLine 2\nLine 3'");
    });

    it('handles backslashes in prompts', () => {
      const adapter = new CodexCLIAdapter();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
      tempPaths.push(tmpDir);

      const params = createTestParams({
        workingDirectory: tmpDir,
        prompt: "Path: C:\\Users\\test\\file.txt",
      });
      const command = adapter.buildCommand(params);

      // Backslashes should be preserved within single quotes
      expect(command).toContain("'Path: C:\\Users\\test\\file.txt'");
    });

    it('handles empty strings', () => {
      const adapter = new CodexCLIAdapter();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
      tempPaths.push(tmpDir);

      const params = createTestParams({
        workingDirectory: tmpDir,
        prompt: "",
      });
      const command = adapter.buildCommand(params);

      // Empty string should still be quoted
      expect(command).toContain("''");
    });

    it('handles consecutive single quotes', () => {
      const adapter = new CodexCLIAdapter();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
      tempPaths.push(tmpDir);

      const params = createTestParams({
        workingDirectory: tmpDir,
        prompt: "Test ''quotes''",
      });
      const command = adapter.buildCommand(params);

      // Each single quote should be properly escaped
      expect(command).toContain("'Test '\\'''\\''quotes'\\'''\\'''");
    });

    it('handles mixed special characters', () => {
      const adapter = new CodexCLIAdapter();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
      tempPaths.push(tmpDir);

      const params = createTestParams({
        workingDirectory: tmpDir,
        prompt: "Test: $VAR `cmd` $(cmd) & | ; < > # !",
      });
      const command = adapter.buildCommand(params);

      // All special shell characters should be safe within single quotes
      expect(command).toContain("'Test: $VAR `cmd` $(cmd) & | ; < > # !'");
    });
  });

  describe('File Operations', () => {
    it('overwrites existing MCP config file', () => {
      const adapter = new CodexCLIAdapter();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
      tempPaths.push(tmpDir);

      // Create initial config
      const mcpConfigPath = path.join(tmpDir, '.codex', 'mcp-config.json');
      fs.mkdirSync(path.dirname(mcpConfigPath), { recursive: true });
      fs.writeFileSync(mcpConfigPath, JSON.stringify({ old: 'data' }), 'utf-8');

      // Build command which should overwrite
      const params = createTestParams({ workingDirectory: tmpDir });
      adapter.buildCommand(params);

      const config = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));
      expect(config.old).toBeUndefined();
      expect(config.taskId).toBe('TASK-999');
    });

    it('creates MCP config when .codex directory already exists', () => {
      const adapter = new CodexCLIAdapter();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
      tempPaths.push(tmpDir);

      // Pre-create .codex directory
      const codexDir = path.join(tmpDir, '.codex');
      fs.mkdirSync(codexDir, { recursive: true });

      const params = createTestParams({ workingDirectory: tmpDir });
      adapter.buildCommand(params);

      const mcpConfigPath = path.join(tmpDir, '.codex', 'mcp-config.json');
      expect(fs.existsSync(mcpConfigPath)).toBe(true);

      const config = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));
      expect(config.taskId).toBe('TASK-999');
    });

    it('overwrites existing AGENTS.md file', () => {
      const adapter = new CodexCLIAdapter();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
      tempPaths.push(tmpDir);

      // Create initial AGENTS.md
      const agentsMdPath = path.join(tmpDir, 'AGENTS.md');
      fs.writeFileSync(agentsMdPath, '# Old Content', 'utf-8');

      const params = createTestParams({
        workingDirectory: tmpDir,
        agentName: 'new-agent',
      });
      adapter.buildCommand(params);

      const content = fs.readFileSync(agentsMdPath, 'utf-8');
      expect(content).not.toContain('Old Content');
      expect(content).toContain('new-agent');
    });
  });

  describe('AGENTS.md Optional Fields', () => {
    it('uses default when agentPrompt is undefined', () => {
      const adapter = new CodexCLIAdapter();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
      tempPaths.push(tmpDir);

      const params = createTestParams({
        workingDirectory: tmpDir,
        agentPrompt: undefined,
      });
      adapter.buildCommand(params);

      const agentsMdPath = path.join(tmpDir, 'AGENTS.md');
      const content = fs.readFileSync(agentsMdPath, 'utf-8');
      expect(content).toContain('AI coding agent');
    });

    it('uses default when agentPrompt is empty string', () => {
      const adapter = new CodexCLIAdapter();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
      tempPaths.push(tmpDir);

      const params = createTestParams({
        workingDirectory: tmpDir,
        agentPrompt: '',
      });
      adapter.buildCommand(params);

      const agentsMdPath = path.join(tmpDir, 'AGENTS.md');
      const content = fs.readFileSync(agentsMdPath, 'utf-8');
      expect(content).toContain('AI coding agent');
    });

    it('uses Standard orchestration when orchestrationPrompt is undefined', () => {
      const adapter = new CodexCLIAdapter();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
      tempPaths.push(tmpDir);

      const params = createTestParams({
        workingDirectory: tmpDir,
        orchestrationPrompt: undefined,
      });
      adapter.buildCommand(params);

      const agentsMdPath = path.join(tmpDir, 'AGENTS.md');
      const content = fs.readFileSync(agentsMdPath, 'utf-8');
      expect(content).toContain('Standard orchestration');
    });

    it('uses Standard orchestration when orchestrationPrompt is empty string', () => {
      const adapter = new CodexCLIAdapter();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
      tempPaths.push(tmpDir);

      const params = createTestParams({
        workingDirectory: tmpDir,
        orchestrationPrompt: '',
      });
      adapter.buildCommand(params);

      const agentsMdPath = path.join(tmpDir, 'AGENTS.md');
      const content = fs.readFileSync(agentsMdPath, 'utf-8');
      expect(content).toContain('Standard orchestration');
    });

    it('wraps orchestrationPrompt in code fence when provided', () => {
      const adapter = new CodexCLIAdapter();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
      tempPaths.push(tmpDir);

      const params = createTestParams({
        workingDirectory: tmpDir,
        orchestrationPrompt: 'Custom orchestration instructions',
      });
      adapter.buildCommand(params);

      const agentsMdPath = path.join(tmpDir, 'AGENTS.md');
      const content = fs.readFileSync(agentsMdPath, 'utf-8');
      expect(content).toContain('``````\nCustom orchestration instructions\n``````');
    });

    it('falls back to prompt when taskPrompt is undefined', () => {
      const adapter = new CodexCLIAdapter();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
      tempPaths.push(tmpDir);

      const params = createTestParams({
        workingDirectory: tmpDir,
        taskPrompt: undefined,
        prompt: 'Fallback prompt text',
      });
      adapter.buildCommand(params);

      const agentsMdPath = path.join(tmpDir, 'AGENTS.md');
      const content = fs.readFileSync(agentsMdPath, 'utf-8');
      expect(content).toContain('Fallback prompt text');
    });
  });

  describe('Command Structure', () => {
    it('builds command with correct flag ordering', () => {
      const adapter = new CodexCLIAdapter();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
      tempPaths.push(tmpDir);

      const params = createTestParams({
        workingDirectory: tmpDir,
        model: 'test-model',
        prompt: 'test-prompt',
      });
      const command = adapter.buildCommand(params);

      // Verify exact structure
      expect(command).toBe("codex --approval-mode full-auto --model 'test-model' 'test-prompt'");
    });

    it('is idempotent when called multiple times', () => {
      const adapter = new CodexCLIAdapter();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
      tempPaths.push(tmpDir);

      const params = createTestParams({
        workingDirectory: tmpDir,
        taskId: 'TASK-100',
      });

      const command1 = adapter.buildCommand(params);
      const command2 = adapter.buildCommand(params);
      const command3 = adapter.buildCommand(params);

      expect(command1).toBe(command2);
      expect(command2).toBe(command3);

      // MCP config should be overwritten with same content
      const mcpConfigPath = path.join(tmpDir, '.codex', 'mcp-config.json');
      const config = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));
      expect(config.taskId).toBe('TASK-100');
    });

    it('includes all required flags', () => {
      const adapter = new CodexCLIAdapter();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
      tempPaths.push(tmpDir);

      const params = createTestParams({ workingDirectory: tmpDir });
      const command = adapter.buildCommand(params);

      // Verify all required flags are present
      expect(command).toMatch(/^codex\s/);
      expect(command).toContain('--approval-mode');
      expect(command).toContain('full-auto');
      expect(command).toContain('--model');

      // Verify flags appear in correct order
      const approvalIndex = command.indexOf('--approval-mode');
      const modelIndex = command.indexOf('--model');

      expect(approvalIndex).toBeLessThan(modelIndex);
    });
  });

  describe('MCP Config Structure', () => {
    it('includes all required fields in MCP config', () => {
      const adapter = new CodexCLIAdapter();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
      tempPaths.push(tmpDir);

      const params = createTestParams({
        workingDirectory: tmpDir,
        taskId: 'TASK-123',
        apiBaseUrl: 'https://api.example.com',
      });
      adapter.buildCommand(params);

      const mcpConfigPath = path.join(tmpDir, '.codex', 'mcp-config.json');
      const config = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));

      expect(config).toHaveProperty('mcpServers');
      expect(config).toHaveProperty('taskId');
      expect(config).toHaveProperty('apiBaseUrl');
      expect(config.taskId).toBe('TASK-123');
      expect(config.apiBaseUrl).toBe('https://api.example.com');
      expect(typeof config.mcpServers).toBe('object');
    });

    it('creates valid JSON in MCP config', () => {
      const adapter = new CodexCLIAdapter();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
      tempPaths.push(tmpDir);

      const params = createTestParams({ workingDirectory: tmpDir });
      adapter.buildCommand(params);

      const mcpConfigPath = path.join(tmpDir, '.codex', 'mcp-config.json');
      const content = fs.readFileSync(mcpConfigPath, 'utf-8');

      // Should be valid, formatted JSON
      expect(() => JSON.parse(content)).not.toThrow();

      // Should be pretty-printed with 2 spaces
      expect(content).toContain('  ');
    });
  });
});
