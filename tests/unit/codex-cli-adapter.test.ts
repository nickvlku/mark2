import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { CodexCLIAdapter } from '@/lib/adapters/codex-cli';
import { PromptAssembler } from '@/lib/orchestration/prompt-assembler';
import { END_TOKENS } from '@/lib/orchestration/pipeline';
import type { RoleConfig } from '@/lib/orchestration/phase-handlers/run-phase';
import type { AgentInvocationParams, Phase, Task } from '@/types';

const TEST_TIMESTAMP = '2026-03-18T12:00:00.000Z';
const AGENTS_PHASES = [
  'design',
  'coding',
  'testing',
  'code_review',
  'fix_review',
  'final_testing',
  'run_test_plan',
  'done',
] as const satisfies readonly Phase[];

type AgentsPhase = (typeof AGENTS_PHASES)[number];

const SIGNAL_INSTRUCTION_LINES: Record<AgentsPhase, string[]> = {
  design: [
    'When done, signal: mark2_signal_complete(task_id, token: "[DESIGN_COMPLETED]")',
  ],
  coding: [
    'When done, signal: mark2_signal_complete(task_id, token: "[CODING_COMPLETED]")',
  ],
  testing: [
    'If all tests pass: mark2_signal_complete(task_id, token: "[TESTING_PASSED]")',
    'If any tests fail: mark2_signal_complete(task_id, token: "[TESTING_FAILED]")',
  ],
  code_review: [
    'If no fixes needed: mark2_signal_complete(task_id, token: "[REVIEW_COMPLETED]")',
    'If fixes are required: mark2_signal_complete(task_id, token: "[REVIEW_NEEDS_FIXES]")',
  ],
  fix_review: [
    'When done, signal: mark2_signal_complete(task_id, token: "[FIX_REVIEW_COMPLETED]")',
  ],
  final_testing: [
    'If any tests fail: mark2_signal_complete(task_id, token: "[FINAL_TESTING_FAILED]")',
    'After creating the test plan: mark2_signal_complete(task_id, token: "[FINAL_TESTING_PASSED]")',
  ],
  run_test_plan: [
    'If all tests pass: mark2_signal_complete(task_id, token: "[RUN_TEST_PLAN_PASSED]")',
    'If any tests fail: mark2_signal_complete(task_id, token: "[RUN_TEST_PLAN_FAILED]")',
  ],
  done: [
    'The task is complete. Signal: mark2_signal_complete(task_id, token: "[TASK_COMPLETED]")',
  ],
};

// Helper to create standard test params
function createTestParams(overrides?: Partial<AgentInvocationParams>): AgentInvocationParams {
  return {
    prompt: 'test prompt',
    taskPrompt: undefined,
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

function createTempClone(taskId = 'TASK-999') {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
  const mark2Dir = path.join(tempDir, '.mark2');
  const workingDir = path.join(mark2Dir, 'clones', taskId);

  fs.mkdirSync(path.join(workingDir, '.git', 'info'), { recursive: true });

  return { tempDir, mark2Dir, workingDir };
}

function createTaskFixture(phase: Phase, taskId = 'TASK-999'): Task {
  return {
    id: taskId,
    title: `Test ${phase} task`,
    description: 'Verify AGENTS.md generation.',
    phase,
    phase_agents: {},
    phase_overrides: {},
    blockers: [],
    priority: 'P2',
    artifacts: [],
    ports: [],
    worktrees: {},
    created_by: 'test',
    merge_strategy: 'squash',
    auto_advance: true,
    auto_approve: false,
    created_at: TEST_TIMESTAMP,
    updated_at: TEST_TIMESTAMP,
    phase_entered_at: TEST_TIMESTAMP,
    loop_count: 0,
    archived: false,
  };
}

function createRoleFixture(): RoleConfig {
  return {
    name: 'expert-fullstack-coder',
    cli_tool: 'codex-cli',
    model: 'gpt-5.2-codex',
    role_prompt: [
      'You are an expert full-stack developer.',
      'Follow the phase instructions precisely.',
    ].join('\n'),
    timeout_minutes: 20,
  };
}

function createPromptBackedParams(phase: AgentsPhase, taskId = 'TASK-999') {
  const { tempDir, mark2Dir, workingDir } = createTempClone(taskId);
  const task = createTaskFixture(phase, taskId);
  const role = createRoleFixture();
  const assembler = new PromptAssembler(mark2Dir);
  const promptParts = assembler.buildAgentAndTaskPrompts(task, role, phase);

  const params = createTestParams({
    prompt: promptParts.taskPrompt,
    taskPrompt: promptParts.taskPrompt,
    orchestrationPrompt: promptParts.orchestrationPrompt,
    agentPrompt: promptParts.agentPrompt,
    workingDirectory: workingDir,
    agentName: role.name,
    model: role.model,
    taskId,
    phase,
    timeoutMinutes: role.timeout_minutes,
  });

  return { tempDir, workingDir, promptParts, params };
}

describe('CodexCLIAdapter', () => {
  const originalHome = process.env.HOME;
  const tempPaths: string[] = [];

  afterEach(() => {
    process.env.HOME = originalHome;
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
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
    tempPaths.push(tmpDir);

    const params = createTestParams({ workingDirectory: tmpDir });
    const command = adapter.buildCommand(params);
    expect(command).toContain('codex');
    expect(command).toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(command).toContain("-c 'mcp_servers.mark2.command=");
    expect(command).toContain('--model');
    expect(command).toContain('gpt-5.2-codex');
  });

  it('returns environment variables including storage paths', () => {
    const adapter = new CodexCLIAdapter();
    const workingDirectory = '/tmp/project/.mark2/clones/TASK-999';
    const params = createTestParams({ workingDirectory });
    const env = adapter.getEnvironment(params);
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
    expect(config.mcpServers.mark2).toBeDefined();
    expect(config.mcpServers.mark2.args).toEqual([
      path.join(process.cwd(), 'src', 'lib', 'mcp', 'index.ts'),
    ]);
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
    expect(content).toContain('You are a test agent');
    expect(content).toContain('orchestration prompt');
    expect(content).toContain('# Available MCP Tools');
  });

  it('handles shell quoting with special characters', () => {
    const adapter = new CodexCLIAdapter();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
    tempPaths.push(tmpDir);

    const params = createTestParams({
      workingDirectory: tmpDir,
      taskPrompt: "Test with 'single quotes' and \"double quotes\"",
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
        taskPrompt: "Line 1\nLine 2\nLine 3",
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
        taskPrompt: "Path: C:\\Users\\test\\file.txt",
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
        taskPrompt: "",
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
        taskPrompt: "Test ''quotes''",
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
        taskPrompt: "Test: $VAR `cmd` $(cmd) & | ; < > # !",
      });
      const command = adapter.buildCommand(params);

      // All special shell characters should be safe within single quotes
      expect(command).toContain("'Test: $VAR `cmd` $(cmd) & | ; < > # !'");
    });
  });

  describe('File Operations', () => {
    it('adds an exact trusted clone entry when a parent project is already trusted', () => {
      const adapter = new CodexCLIAdapter();
      const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
      const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-project-'));
      const workingDirectory = path.join(projectRoot, '.mark2', 'clones', 'TASK-999');
      tempPaths.push(homeDir, projectRoot);
      process.env.HOME = homeDir;

      fs.mkdirSync(workingDirectory, { recursive: true });
      fs.mkdirSync(path.join(homeDir, '.codex'), { recursive: true });
      fs.writeFileSync(
        path.join(homeDir, '.codex', 'config.toml'),
        `[projects."${projectRoot}"]\ntrust_level = "trusted"\n`,
        'utf-8',
      );

      adapter.buildCommand(createTestParams({ workingDirectory }));

      const config = fs.readFileSync(path.join(homeDir, '.codex', 'config.toml'), 'utf-8');
      expect(config).toContain(`[projects."${workingDirectory}"]`);
      expect(config).toContain('trust_level = "trusted"');
    });

    it('does not auto-trust a clone when no trusted ancestor exists', () => {
      const adapter = new CodexCLIAdapter();
      const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
      const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-project-'));
      const workingDirectory = path.join(projectRoot, '.mark2', 'clones', 'TASK-999');
      tempPaths.push(homeDir, projectRoot);
      process.env.HOME = homeDir;

      fs.mkdirSync(workingDirectory, { recursive: true });
      fs.mkdirSync(path.join(homeDir, '.codex'), { recursive: true });
      fs.writeFileSync(
        path.join(homeDir, '.codex', 'config.toml'),
        `[projects."/some/other/project"]\ntrust_level = "trusted"\n`,
        'utf-8',
      );

      adapter.buildCommand(createTestParams({ workingDirectory }));

      const config = fs.readFileSync(path.join(homeDir, '.codex', 'config.toml'), 'utf-8');
      expect(config).not.toContain(`[projects."${workingDirectory}"]`);
    });

    it('does not duplicate an existing exact trusted clone entry', () => {
      const adapter = new CodexCLIAdapter();
      const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
      const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-project-'));
      const workingDirectory = path.join(projectRoot, '.mark2', 'clones', 'TASK-999');
      tempPaths.push(homeDir, projectRoot);
      process.env.HOME = homeDir;

      fs.mkdirSync(workingDirectory, { recursive: true });
      fs.mkdirSync(path.join(homeDir, '.codex'), { recursive: true });
      fs.writeFileSync(
        path.join(homeDir, '.codex', 'config.toml'),
        [
          `[projects."${projectRoot}"]`,
          'trust_level = "trusted"',
          '',
          `[projects."${workingDirectory}"]`,
          'trust_level = "trusted"',
          '',
        ].join('\n'),
        'utf-8',
      );

      adapter.buildCommand(createTestParams({ workingDirectory }));

      const config = fs.readFileSync(path.join(homeDir, '.codex', 'config.toml'), 'utf-8');
      const matches = config.match(new RegExp(`\\[projects\\."${workingDirectory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\]`, 'g'));
      expect(matches).toHaveLength(1);
    });

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
      expect(config.mcpServers.mark2).toBeDefined();
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
      expect(config.mcpServers.mark2).toBeDefined();
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
        agentPrompt: 'new agent prompt',
      });
      adapter.buildCommand(params);

      const content = fs.readFileSync(agentsMdPath, 'utf-8');
      expect(content).not.toContain('Old Content');
      expect(content).toContain('new agent prompt');
    });
  });

  describe('AGENTS.md Optional Fields', () => {
    it('omits the agent role section when agentPrompt is undefined', () => {
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
      expect(content).not.toContain('# Agent Role');
      expect(content).toContain('orchestration prompt');
    });

    it('omits the agent role section when agentPrompt is empty', () => {
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
      expect(content).not.toContain('# Agent Role');
      expect(content).toContain('orchestration prompt');
    });

    it('omits orchestration content when orchestrationPrompt is undefined', () => {
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
      expect(content).toContain('agent prompt');
      expect(content).not.toContain('orchestration prompt');
    });

    it('omits orchestration content when orchestrationPrompt is empty', () => {
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
      expect(content).toContain('agent prompt');
      expect(content).not.toContain('orchestration prompt');
    });

    it('writes orchestrationPrompt as raw markdown when provided', () => {
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
      expect(content).toContain('Custom orchestration instructions');
    });

    it('does not include taskPrompt content in AGENTS.md', () => {
      const adapter = new CodexCLIAdapter();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
      tempPaths.push(tmpDir);

      const params = createTestParams({
        workingDirectory: tmpDir,
        taskPrompt: undefined,
        prompt: 'Fallback prompt text',
      });
      const command = adapter.buildCommand(params);
      expect(command).toContain("'Fallback prompt text'");
    });
  });

  describe('Command Structure', () => {
    it('builds command with MCP overrides and correct flag ordering', () => {
      const adapter = new CodexCLIAdapter();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
      tempPaths.push(tmpDir);

      const params = createTestParams({
        workingDirectory: tmpDir,
        model: 'test-model',
        prompt: 'test-prompt',
        taskPrompt: 'test-prompt',
      });
      const command = adapter.buildCommand(params);

      expect(command).toMatch(/^codex\s/);
      expect(command).toContain('--dangerously-bypass-approvals-and-sandbox');
      expect(command).toContain("'mcp_servers.mark2.command=");
      expect(command).toContain("'mcp_servers.mark2.args=");
      expect(command).toContain("--model 'test-model'");
      expect(command).toContain("'test-prompt'");
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
      expect(command).toContain('--dangerously-bypass-approvals-and-sandbox');
      expect(command).toContain("-c 'mcp_servers.mark2.command=");
      expect(command).toContain('--model');

      // Verify flags appear in correct order
      const bypassIndex = command.indexOf('--dangerously-bypass-approvals-and-sandbox');
      const mcpIndex = command.indexOf("mcp_servers.mark2.command=");
      const modelIndex = command.indexOf('--model');

      expect(bypassIndex).toBeLessThan(mcpIndex);
      expect(mcpIndex).toBeLessThan(modelIndex);
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
      expect(config.mcpServers.mark2.command).toBe(
        path.join(process.cwd(), 'node_modules', '.bin', 'tsx'),
      );
      expect(config.mcpServers.mark2.args).toEqual([
        path.join(process.cwd(), 'src', 'lib', 'mcp', 'index.ts'),
      ]);
      expect(config.mcpServers.mark2.env.MARK2_TASK_ID).toBe('TASK-123');
      expect(config.mcpServers.mark2.env.MARK2_API_URL).toBe('https://api.example.com');
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

  it('AGENTS.md contains the required sections and assembled prompt content', () => {
    const adapter = new CodexCLIAdapter();
    const { tempDir, params, promptParts, workingDir } = createPromptBackedParams('coding');
    tempPaths.push(tempDir);
    adapter.buildCommand(params);

    const agentsMdPath = path.join(workingDir, 'AGENTS.md');
    const content = fs.readFileSync(agentsMdPath, 'utf-8');

    expect(content).toContain('# Agent Role');
    expect(content).toContain('# ORCHESTRATION INSTRUCTIONS');
    expect(content).toContain('## Signaling Phase Completion');
    expect(content).toContain('# Available MCP Tools');
    expect(content).toContain(promptParts.agentPrompt);
    expect(content).toContain(promptParts.orchestrationPrompt);
    expect(content).toContain('mark2_signal_complete');
    expect(content).toContain('mark2_save_artifact');
    expect(content).toContain('mark2_git_commit');
  });

  it.each(AGENTS_PHASES)('writes correct end-token instructions for %s', (phase) => {
    const adapter = new CodexCLIAdapter();
    const { tempDir, params, workingDir } = createPromptBackedParams(phase);
    tempPaths.push(tempDir);

    adapter.buildCommand(params);

    const agentsMdPath = path.join(workingDir, 'AGENTS.md');
    const content = fs.readFileSync(agentsMdPath, 'utf-8');
    const expectedTokenLine = `Valid completion tokens for this phase: ${END_TOKENS[phase].join(', ')}`;

    expect(content).toContain(expectedTokenLine);

    for (const token of END_TOKENS[phase]) {
      expect(content).toContain(token);
    }

    for (const instructionLine of SIGNAL_INSTRUCTION_LINES[phase]) {
      expect(content).toContain(instructionLine);
    }
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

  describe('cleanup', () => {
    it('deletes .codex/mcp-config.json', async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'codex-cleanup-'));
      tempPaths.push(tmpDir);

      // Setup: create .codex/mcp-config.json
      fs.mkdirSync(path.join(tmpDir, '.codex'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '.codex', 'mcp-config.json'), '{"mcpServers":{}}');

      const adapter = new CodexCLIAdapter();
      await adapter.cleanup(tmpDir);

      expect(fs.existsSync(path.join(tmpDir, '.codex', 'mcp-config.json'))).toBe(false);
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

      // Setup: create .codex/mcp-config.json
      fs.mkdirSync(path.join(tmpDir, '.codex'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '.codex', 'mcp-config.json'), '{"mcpServers":{}}');

      const adapter = new CodexCLIAdapter();
      await adapter.cleanup(tmpDir);

      expect(fs.existsSync(path.join(tmpDir, '.codex'))).toBe(false);
    });

    it('preserves .codex directory when not empty', async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'codex-cleanup-'));
      tempPaths.push(tmpDir);

      // Setup: create .codex/mcp-config.json and an extra file
      fs.mkdirSync(path.join(tmpDir, '.codex'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '.codex', 'mcp-config.json'), '{"mcpServers":{}}');
      fs.writeFileSync(path.join(tmpDir, '.codex', 'other-file.txt'), 'keep me');

      const adapter = new CodexCLIAdapter();
      await adapter.cleanup(tmpDir);

      // Directory should still exist
      expect(fs.existsSync(path.join(tmpDir, '.codex'))).toBe(true);
      // mcp-config.json should be deleted
      expect(fs.existsSync(path.join(tmpDir, '.codex', 'mcp-config.json'))).toBe(false);
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

      // Setup: create both mcp-config.json and AGENTS.md
      fs.mkdirSync(path.join(tmpDir, '.codex'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '.codex', 'mcp-config.json'), '{"mcpServers":{}}');
      fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agent Instructions');

      const adapter = new CodexCLIAdapter();
      await adapter.cleanup(tmpDir);

      // All should be gone
      expect(fs.existsSync(path.join(tmpDir, '.codex', 'mcp-config.json'))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, '.codex'))).toBe(false);
    });

    it('handles partial cleanup (only some files exist)', async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'codex-cleanup-'));
      tempPaths.push(tmpDir);

      // Setup: only create AGENTS.md, not .codex/mcp-config.json
      fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agent Instructions');

      const adapter = new CodexCLIAdapter();
      await adapter.cleanup(tmpDir);

      // AGENTS.md should be deleted
      expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(false);
      // .codex directory should not exist (and that's fine)
      expect(fs.existsSync(path.join(tmpDir, '.codex'))).toBe(false);
    });

    it('cleans up files actually created by buildCommand()', async () => {
      const adapter = new CodexCLIAdapter();
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'codex-lifecycle-'));
      tempPaths.push(tmpDir);

      // buildCommand creates .codex/mcp-config.json and AGENTS.md
      const params = createTestParams({ workingDirectory: tmpDir });
      adapter.buildCommand(params);

      // Verify files were created
      expect(fs.existsSync(path.join(tmpDir, '.codex', 'mcp-config.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);

      // Cleanup should remove them
      await adapter.cleanup(tmpDir);

      expect(fs.existsSync(path.join(tmpDir, '.codex', 'mcp-config.json'))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(false);
    });
  });
});
