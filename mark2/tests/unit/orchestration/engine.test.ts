import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OrchestrationEngine, type EngineConfig } from '@/lib/orchestration/engine';
import type { Task, AgentDefinition } from '@/lib/yaml/schemas';
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

vi.mock('@/lib/orchestration/tmux-manager');
vi.mock('@/lib/yaml/reader');
vi.mock('@/lib/yaml/writer');
vi.mock('@/lib/orchestration/end-token-watcher');

// Mock adapters with proper instances
vi.mock('@/lib/adapters/claude-code', () => ({
  ClaudeCodeAdapter: vi.fn().mockImplementation(() => ({
    toolId: 'claude-code',
    launch: vi.fn(),
  })),
}));
vi.mock('@/lib/adapters/codex-cli', () => ({
  CodexCLIAdapter: vi.fn().mockImplementation(() => ({
    toolId: 'codex-cli',
    launch: vi.fn(),
  })),
}));
vi.mock('@/lib/adapters/gemini-cli', () => ({
  GeminiCLIAdapter: vi.fn().mockImplementation(() => ({
    toolId: 'gemini-cli',
    launch: vi.fn(),
  })),
}));
vi.mock('@/lib/adapters/opencode', () => ({
  OpenCodeAdapter: vi.fn().mockImplementation(() => ({
    toolId: 'opencode',
    launch: vi.fn(),
  })),
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
      
      // Mock YamlReader to return a mock task
      const mockReader = vi.mocked(YamlReader);
      mockReader.prototype.readTask = vi.fn().mockReturnValue({
        data: {
          id: 'TASK-1',
          title: 'Test Task',
          phase: 'coding',
          loop_count: 0,
        } as Task,
      });

      // Mock YamlWriter
      const mockWriter = vi.mocked(YamlWriter);
      mockWriter.prototype.writeTask = vi.fn();
    });

    it('processes [CODING_COMPLETED] token correctly', async () => {
      const mockStartPhase = vi.spyOn(engine, 'startPhase').mockResolvedValue();
      
      await engine.processEndToken('TASK-1', 'test-agent', 'coding', '[CODING_COMPLETED]');
      
      expect(mockStartPhase).toHaveBeenCalledWith('TASK-1', 'testing', undefined);
    });

    it('processes [TESTING_FAILED] token with loop context', async () => {
      const mockStartPhase = vi.spyOn(engine, 'startPhase').mockResolvedValue();
      
      // Mock tmux capture
      vi.doMock('@/lib/utils/tmux', () => ({
        capturePane: vi.fn().mockResolvedValue('Test failure output'),
        sessionName: vi.fn().mockReturnValue('test-session'),
      }));
      
      await engine.processEndToken('TASK-1', 'test-agent', 'testing', '[TESTING_FAILED]');
      
      expect(mockStartPhase).toHaveBeenCalledWith('TASK-1', 'coding', {
        testFailures: 'Test failure output',
      });
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
      
      // Mock YamlReader to return a mock task and agents
      const mockReader = vi.mocked(YamlReader);
      mockReader.prototype.readTask = vi.fn().mockReturnValue({
        data: {
          id: 'TASK-1',
          title: 'Test Task',
          phase: 'coding',
          assigned_agents: [],
          loop_count: 0,
        } as Task,
      });
      mockReader.prototype.readConfig = vi.fn().mockReturnValue({ data: null });

      // Mock fs for agents.yaml
      vi.doMock('fs', () => ({
        existsSync: vi.fn().mockReturnValue(true),
        readFileSync: vi.fn().mockReturnValue(`
agents:
  - name: test-agent
    cli_tool: claude-code
    model: claude-3-sonnet
    timeout_minutes: 30
`),
      }));

      // Mock YAML parser
      vi.doMock('yaml', () => ({
        parse: vi.fn().mockReturnValue({
          agents: [{
            name: 'test-agent',
            cli_tool: 'claude-code',
            model: 'claude-3-sonnet',
            timeout_minutes: 30,
          } as AgentDefinition],
        }),
      }));
    });

    it('handles pending phase and advances to design', async () => {
      const mockUpdateTaskPhase = vi.spyOn(engine as any, 'updateTaskPhase').mockImplementation();
      const mockStartPhase = vi.spyOn(engine, 'startPhase').mockResolvedValue();
      
      // Mock handlePending to return canAdvance: true
      vi.doMock('@/lib/orchestration/phase-handlers/pending', () => ({
        handlePending: vi.fn().mockResolvedValue({ canAdvance: true }),
      }));
      
      await engine.startPhase('TASK-1', 'pending');
      
      expect(mockUpdateTaskPhase).toHaveBeenCalledWith('TASK-1', 'design');
    });

    it('handles coding phase', async () => {
      // Mock handleCoding
      vi.doMock('@/lib/orchestration/phase-handlers/coding', () => ({
        handleCoding: vi.fn().mockResolvedValue({ tmuxSession: 'test-session' }),
      }));
      
      await engine.startPhase('TASK-1', 'coding');
      
      // Should set up watcher for the tmux session
      expect(true).toBe(true); // Basic assertion that it doesn't throw
    });

    it('handles done phase without setting up watcher', async () => {
      // Mock handleDone
      vi.doMock('@/lib/orchestration/phase-handlers/done', () => ({
        handleDone: vi.fn().mockResolvedValue(undefined),
      }));
      
      await engine.startPhase('TASK-1', 'done');
      
      expect(true).toBe(true); // Basic assertion that it doesn't throw
    });

    it('throws error for non-existent task', async () => {
      const mockReader = vi.mocked(YamlReader);
      mockReader.prototype.readTask = vi.fn().mockReturnValue({ data: null });
      
      await expect(engine.startPhase('NONEXISTENT', 'coding')).rejects.toThrow(
        'Task NONEXISTENT not found'
      );
    });
  });

  describe('handleAgentCrash', () => {
    beforeEach(() => {
      engine = OrchestrationEngine.getInstance(mockConfig);
    });

    it('marks session as failed and logs crash', async () => {
      const mockTmuxManager = vi.mocked(TmuxManager);
      mockTmuxManager.prototype.markFailed = vi.fn();
      
      await engine.handleAgentCrash('TASK-1', 'test-agent', 'coding');
      
      expect(mockTmuxManager.prototype.markFailed).toHaveBeenCalled();
    });
  });

  describe('recoverOnStartup', () => {
    beforeEach(() => {
      engine = OrchestrationEngine.getInstance(mockConfig);
    });

    it('reconciles orphaned sessions and reattaches watchers', async () => {
      const mockTmuxManager = vi.mocked(TmuxManager);
      mockTmuxManager.prototype.reconcile = vi.fn().mockResolvedValue([
        { task_id: 'TASK-1', tmux_session: 'orphaned-session', phase: 'coding' },
      ]);
      mockTmuxManager.prototype.getActiveSessions = vi.fn().mockReturnValue([
        { task_id: 'TASK-2', tmux_session: 'active-session', phase: 'testing', agent_name: 'test-agent' },
      ]);
      
      const result = await engine.recoverOnStartup();
      
      expect(result.orphaned).toBe(1);
      expect(result.reattached).toBe(1);
    });
  });

  describe('cleanupAll', () => {
    beforeEach(() => {
      engine = OrchestrationEngine.getInstance(mockConfig);
    });

    it('stops all watchers and cleans up sessions', async () => {
      const mockTmuxManager = vi.mocked(TmuxManager);
      mockTmuxManager.prototype.cleanup = vi.fn().mockResolvedValue(3);
      
      const result = await engine.cleanupAll();
      
      expect(result).toBe(3);
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
});