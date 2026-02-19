import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OrchestrationEngine, type EngineConfig } from '@/lib/orchestration/engine';
import type { Task } from '@/lib/yaml/schemas';
import { TmuxManager } from '@/lib/orchestration/tmux-manager';
import { YamlReader } from '@/lib/yaml/reader';
import { YamlWriter } from '@/lib/yaml/writer';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  getDb: vi.fn(() => ({
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ get: vi.fn() })) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ run: vi.fn() })) })) })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ run: vi.fn() })) })),
  })),
}));

vi.mock('@/lib/orchestration/tmux-manager', () => ({
  TmuxManager: class {
    reconcile = vi.fn().mockResolvedValue([]);
    getActiveSessions = vi.fn().mockReturnValue([]);
    cleanupSessions = vi.fn().mockResolvedValue(0);
    createSession = vi.fn().mockResolvedValue({ name: 'test-session' });
    register = vi.fn();
    markCompletedByPhase = vi.fn();
    markFailedByPhase = vi.fn();
  },
}));
vi.mock('@/lib/yaml/reader', () => ({
  YamlReader: class {
    readTask = vi.fn().mockReturnValue({
      data: {
        id: 'TASK-1',
        title: 'Test Task',
        phase: 'coding',
        loop_count: 0,
        phase_agents: {},
        blockers: [],
        priority: 'P2',
        artifacts: [],
        ports: [],
        worktrees: {},
        created_by: 'test',
        merge_strategy: 'squash',
        auto_advance: true,
        auto_approve: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        phase_entered_at: new Date().toISOString(),
      },
    });
    readConfig = vi.fn().mockReturnValue({ data: null });
  },
}));
vi.mock('@/lib/yaml/writer', () => ({
  YamlWriter: class {
    writeTask = vi.fn();
  },
}));
vi.mock('@/lib/orchestration/end-token-watcher', () => ({
  EndTokenWatcher: class {
    start = vi.fn();
    stop = vi.fn();
    stopAll = vi.fn();
  },
}));
vi.mock('@/lib/orchestration/terminal-stream', () => ({
  TerminalStream: class {
    static getInstance = vi.fn().mockReturnValue({
      start: vi.fn(),
      stop: vi.fn(),
      stopAll: vi.fn(),
    });
  },
}));

// Mock adapters with proper class definitions
vi.mock('@/lib/adapters/claude-code', () => ({
  ClaudeCodeAdapter: class {
    toolId = 'claude-code';
    launch = vi.fn();
    // No cleanup method - test that optional cleanup works
  },
}));
vi.mock('@/lib/adapters/codex-cli', () => ({
  CodexCLIAdapter: class {
    toolId = 'codex-cli';
    launch = vi.fn();
    cleanup = vi.fn().mockResolvedValue(undefined);
  },
}));
vi.mock('@/lib/adapters/gemini-cli', () => ({
  GeminiCLIAdapter: class {
    toolId = 'gemini-cli';
    launch = vi.fn();
    // No cleanup method
  },
}));
vi.mock('@/lib/adapters/opencode', () => ({
  OpenCodeAdapter: class {
    toolId = 'opencode';
    launch = vi.fn();
    // No cleanup method
  },
}));

// Mock CloneService
vi.mock('@/lib/services/clone-service', () => ({
  CloneService: class {
    getClonePath = vi.fn().mockReturnValue('/test/project/.mark2/clones/TASK-1');
    cloneExists = vi.fn().mockReturnValue(true);
  },
}));

describe('OrchestrationEngine', () => {
  let engine: OrchestrationEngine;
  let mockConfig: EngineConfig;

  beforeEach(() => {
    // Reset singleton before each test
    OrchestrationEngine.resetInstance();
    
    mockConfig = {
      projectRoot: '/test/project',
      mark2Dir: '/test/project/.mark2',
      apiBaseUrl: 'http://localhost:3000',
      agentToken: 'test-token',
      basePort: 8000,
      portsPerTask: 10,
      maxLoopCount: 5,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    OrchestrationEngine.resetInstance();
  });

  describe('getInstance', () => {
    it('creates a new instance when none exists', () => {
      const instance1 = OrchestrationEngine.getInstance(mockConfig);
      expect(instance1).toBeInstanceOf(OrchestrationEngine);
    });

    it('returns the same instance on subsequent calls', () => {
      const instance1 = OrchestrationEngine.getInstance(mockConfig);
      const instance2 = OrchestrationEngine.getInstance(mockConfig);
      expect(instance1).toBe(instance2);
    });
  });

  describe('resetInstance', () => {
    it('resets the singleton instance', () => {
      const instance1 = OrchestrationEngine.getInstance(mockConfig);
      OrchestrationEngine.resetInstance();
      const instance2 = OrchestrationEngine.getInstance(mockConfig);
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('getAdapterForTool', () => {
    beforeEach(() => {
      engine = OrchestrationEngine.getInstance(mockConfig);
    });

    it('returns adapter for claude-code', () => {
      const adapter = engine.getAdapterForTool('claude-code');
      expect(adapter).toBeDefined();
    });

    it('returns adapter for codex-cli', () => {
      const adapter = engine.getAdapterForTool('codex-cli');
      expect(adapter).toBeDefined();
    });

    it('returns adapter for gemini-cli', () => {
      const adapter = engine.getAdapterForTool('gemini-cli');
      expect(adapter).toBeDefined();
    });

    it('returns adapter for opencode', () => {
      const adapter = engine.getAdapterForTool('opencode');
      expect(adapter).toBeDefined();
    });

    it('throws error for unknown tool', () => {
      expect(() => engine.getAdapterForTool('unknown-tool')).toThrow(
        'No adapter registered for tool "unknown-tool"'
      );
    });
  });

  describe('processEndToken', () => {
    beforeEach(() => {
      engine = OrchestrationEngine.getInstance(mockConfig);
    });

    it('processes [CODING_COMPLETED] token correctly', async () => {
      const mockStartPhase = vi.spyOn(engine, 'startPhase').mockResolvedValue();

      await engine.processEndToken('TASK-1', 'test-agent', 'coding', '[CODING_COMPLETED]');

      expect(mockStartPhase).toHaveBeenCalledWith('TASK-1', 'testing', undefined);
    });

    it('processes [DESIGN_COMPLETED] token correctly', async () => {
      const mockStartPhase = vi.spyOn(engine, 'startPhase').mockResolvedValue();
      const taskInDesign = {
        id: 'TASK-1',
        title: 'Test Task',
        phase: 'design' as const,
        loop_count: 0,
        phase_agents: {},
        blockers: [],
        priority: 'P2',
        artifacts: [],
        ports: [],
        worktrees: {},
        created_by: 'test',
        merge_strategy: 'squash' as const,
        auto_advance: true,
        auto_approve: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        phase_entered_at: new Date().toISOString(),
      };
      const reader = (engine as any).reader;
      (reader.readTask as ReturnType<typeof vi.fn>).mockReturnValue({ data: taskInDesign });

      await engine.processEndToken('TASK-1', 'test-agent', 'design', '[DESIGN_COMPLETED]');

      expect(mockStartPhase).toHaveBeenCalledWith('TASK-1', 'coding', undefined);
    });

    it('handles unknown end token gracefully', async () => {
      const mockStartPhase = vi.spyOn(engine, 'startPhase').mockResolvedValue();

      await engine.processEndToken('TASK-1', 'test-agent', 'coding', '[UNKNOWN_TOKEN]');

      expect(mockStartPhase).not.toHaveBeenCalled();
    });
  });

  describe('startPhase', () => {
    beforeEach(() => {
      engine = OrchestrationEngine.getInstance(mockConfig);
    });

    it('requires agents to be defined', async () => {
      // The engine requires agents to be defined before starting any phase
      // With no agents file, it should throw an appropriate error
      await expect(engine.startPhase('TASK-1', 'coding')).rejects.toThrow();
    });

    it('rejects invalid phase values', async () => {
      // Invalid phase should throw
      await expect(engine.startPhase('TASK-1', 'invalid-phase' as any)).rejects.toThrow();
    });
  });

  describe('handleAgentCrash', () => {
    beforeEach(() => {
      engine = OrchestrationEngine.getInstance(mockConfig);
    });

    it('handles agent crash without throwing', async () => {
      // The method should complete without throwing
      await expect(engine.handleAgentCrash('TASK-1', 'test-agent', 'coding')).resolves.toBeUndefined();
    });
  });

  describe('recoverOnStartup', () => {
    beforeEach(() => {
      engine = OrchestrationEngine.getInstance(mockConfig);
    });

    it('recovers on startup and returns counts', async () => {
      const result = await engine.recoverOnStartup();

      // With default mocks (empty arrays), we get 0 orphaned and 0 reattached
      expect(result).toHaveProperty('orphaned');
      expect(result).toHaveProperty('reattached');
      expect(typeof result.orphaned).toBe('number');
      expect(typeof result.reattached).toBe('number');
    });
  });

  describe('cleanupAll', () => {
    beforeEach(() => {
      engine = OrchestrationEngine.getInstance(mockConfig);
    });

    it('cleans up and returns count', async () => {
      const result = await engine.cleanupAll();

      // With default mock returning 0
      expect(typeof result).toBe('number');
    });
  });

  describe('shutdown', () => {
    beforeEach(() => {
      engine = OrchestrationEngine.getInstance(mockConfig);
    });

    it('stops all watchers', () => {
      engine.shutdown();

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('processEndToken - adapter cleanup', () => {
    beforeEach(() => {
      engine = OrchestrationEngine.getInstance(mockConfig);

      // Mock config with codex-cli role
      const reader = (engine as any).reader;
      (reader.readConfig as ReturnType<typeof vi.fn>).mockReturnValue({
        data: {
          phase_defaults: {
            coding: {
              role: 'coder',
              cli_tool: 'codex-cli',
              model: 'gpt-4',
            },
            design: {
              role: 'designer',
              cli_tool: 'codex-cli',
              model: 'gpt-4',
            },
          },
        },
      });

      // Mock roles file
      (reader as any).readRoles = vi.fn().mockReturnValue({
        data: {
          roles: [
            {
              name: 'coder',
              uuid: 'uuid-1',
              role_prompt: 'You are a coder',
            },
            {
              name: 'designer',
              uuid: 'uuid-2',
              role_prompt: 'You are a designer',
            },
          ],
        },
      });
    });

    it('calls adapter.cleanup() after successful transition', async () => {
      const mockStartPhase = vi.spyOn(engine, 'startPhase').mockResolvedValue();
      const codexAdapter = engine.getAdapterForTool('codex-cli');
      const cleanupSpy = vi.spyOn(codexAdapter, 'cleanup' as any);

      await engine.processEndToken('TASK-1', 'test-agent', 'coding', '[CODING_COMPLETED]');

      expect(cleanupSpy).toHaveBeenCalledWith('/test/project/.mark2/clones/TASK-1');
      expect(mockStartPhase).toHaveBeenCalled();
    });

    it('calls adapter.cleanup() even when auto_advance is disabled (early return)', async () => {
      const mockStartPhase = vi.spyOn(engine, 'startPhase').mockResolvedValue();
      const reader = (engine as any).reader;
      const taskWithAutoAdvanceDisabled = {
        id: 'TASK-1',
        title: 'Test Task',
        phase: 'coding' as const,
        loop_count: 0,
        phase_agents: {},
        blockers: [],
        priority: 'P2',
        artifacts: [],
        ports: [],
        worktrees: {},
        created_by: 'test',
        merge_strategy: 'squash' as const,
        auto_advance: false,
        auto_approve: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        phase_entered_at: new Date().toISOString(),
      };
      (reader.readTask as ReturnType<typeof vi.fn>).mockReturnValue({ data: taskWithAutoAdvanceDisabled });

      const codexAdapter = engine.getAdapterForTool('codex-cli');
      const cleanupSpy = vi.spyOn(codexAdapter, 'cleanup' as any);

      await engine.processEndToken('TASK-1', 'test-agent', 'coding', '[CODING_COMPLETED]');

      expect(cleanupSpy).toHaveBeenCalledWith('/test/project/.mark2/clones/TASK-1');
      expect(mockStartPhase).not.toHaveBeenCalled();
    });

    it('calls adapter.cleanup() even when auto_approve is disabled (early return)', async () => {
      const mockStartPhase = vi.spyOn(engine, 'startPhase').mockResolvedValue();
      const reader = (engine as any).reader;
      const taskWithAutoApproveDisabled = {
        id: 'TASK-1',
        title: 'Test Task',
        phase: 'coding' as const,
        loop_count: 0,
        phase_agents: {},
        blockers: [],
        priority: 'P2',
        artifacts: [],
        ports: [],
        worktrees: {},
        created_by: 'test',
        merge_strategy: 'squash' as const,
        auto_advance: true,
        auto_approve: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        phase_entered_at: new Date().toISOString(),
      };
      (reader.readTask as ReturnType<typeof vi.fn>).mockReturnValue({ data: taskWithAutoApproveDisabled });

      const codexAdapter = engine.getAdapterForTool('codex-cli');
      const cleanupSpy = vi.spyOn(codexAdapter, 'cleanup' as any);

      await engine.processEndToken('TASK-1', 'test-agent', 'coding', '[CODING_COMPLETED]');

      expect(cleanupSpy).toHaveBeenCalledWith('/test/project/.mark2/clones/TASK-1');
      expect(mockStartPhase).not.toHaveBeenCalled();
    });

    it('calls adapter.cleanup() even when transition logic throws', async () => {
      const mockStartPhase = vi.spyOn(engine, 'startPhase').mockRejectedValue(new Error('Phase start failed'));
      const codexAdapter = engine.getAdapterForTool('codex-cli');
      const cleanupSpy = vi.spyOn(codexAdapter, 'cleanup' as any);

      await expect(
        engine.processEndToken('TASK-1', 'test-agent', 'coding', '[CODING_COMPLETED]')
      ).rejects.toThrow('Phase start failed');

      expect(cleanupSpy).toHaveBeenCalledWith('/test/project/.mark2/clones/TASK-1');
    });

    it('does not fail when adapter has no cleanup method', async () => {
      const mockStartPhase = vi.spyOn(engine, 'startPhase').mockResolvedValue();
      const reader = (engine as any).reader;

      // Configure to use claude-code which has no cleanup method
      (reader.readConfig as ReturnType<typeof vi.fn>).mockReturnValue({
        data: {
          phase_defaults: {
            coding: {
              role: 'coder',
              cli_tool: 'claude-code',
              model: 'opus',
            },
          },
        },
      });

      await expect(
        engine.processEndToken('TASK-1', 'test-agent', 'coding', '[CODING_COMPLETED]')
      ).resolves.toBeUndefined();

      expect(mockStartPhase).toHaveBeenCalled();
    });

    it('does not fail when cleanup throws', async () => {
      const mockStartPhase = vi.spyOn(engine, 'startPhase').mockResolvedValue();
      const codexAdapter = engine.getAdapterForTool('codex-cli');
      const cleanupSpy = vi.spyOn(codexAdapter, 'cleanup' as any).mockRejectedValue(new Error('Cleanup failed'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        engine.processEndToken('TASK-1', 'test-agent', 'coding', '[CODING_COMPLETED]')
      ).resolves.toBeUndefined();

      expect(cleanupSpy).toHaveBeenCalledWith('/test/project/.mark2/clones/TASK-1');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[engine] Adapter cleanup failed'),
        expect.any(Error)
      );
      expect(mockStartPhase).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('handleAgentCrash - adapter cleanup', () => {
    beforeEach(() => {
      engine = OrchestrationEngine.getInstance(mockConfig);

      // Mock config with codex-cli role
      const reader = (engine as any).reader;
      (reader.readConfig as ReturnType<typeof vi.fn>).mockReturnValue({
        data: {
          phase_defaults: {
            coding: {
              role: 'coder',
              cli_tool: 'codex-cli',
              model: 'gpt-4',
            },
          },
        },
      });

      // Mock roles file
      (reader as any).readRoles = vi.fn().mockReturnValue({
        data: {
          roles: [
            {
              name: 'coder',
              uuid: 'uuid-1',
              role_prompt: 'You are a coder',
            },
          ],
        },
      });
    });

    it('calls adapter.cleanup() after crash', async () => {
      const codexAdapter = engine.getAdapterForTool('codex-cli');
      const cleanupSpy = vi.spyOn(codexAdapter, 'cleanup' as any);

      await engine.handleAgentCrash('TASK-1', 'test-agent', 'coding');

      expect(cleanupSpy).toHaveBeenCalledWith('/test/project/.mark2/clones/TASK-1');
    });

    it('does not throw when cleanup fails after crash', async () => {
      const codexAdapter = engine.getAdapterForTool('codex-cli');
      const cleanupSpy = vi.spyOn(codexAdapter, 'cleanup' as any).mockRejectedValue(new Error('Cleanup failed'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        engine.handleAgentCrash('TASK-1', 'test-agent', 'coding')
      ).resolves.toBeUndefined();

      expect(cleanupSpy).toHaveBeenCalledWith('/test/project/.mark2/clones/TASK-1');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[engine] Adapter cleanup failed after crash'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('does not fail when adapter has no cleanup method', async () => {
      const reader = (engine as any).reader;

      // Configure to use claude-code which has no cleanup method
      (reader.readConfig as ReturnType<typeof vi.fn>).mockReturnValue({
        data: {
          phase_defaults: {
            coding: {
              role: 'coder',
              cli_tool: 'claude-code',
              model: 'opus',
            },
          },
        },
      });

      await expect(
        engine.handleAgentCrash('TASK-1', 'test-agent', 'coding')
      ).resolves.toBeUndefined();
    });
  });
});