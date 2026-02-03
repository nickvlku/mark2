import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import type { Task } from '@/lib/yaml/schemas';
import { eq } from 'drizzle-orm';

// Create a temporary directory for testing
const TEST_PROJECT_ROOT = '/tmp/mark2-phase-transition-test';
const TEST_MARK2_DIR = path.join(TEST_PROJECT_ROOT, '.mark2');
const TEST_TASK_ID = 'TASK-1';

// Use vi.hoisted to create mocks that are available during vi.mock hoisting
const mockTmuxManager = vi.hoisted(() => ({
  spawnAgent: vi.fn().mockResolvedValue('mock-session'),
  reconcile: vi.fn().mockResolvedValue([]),
  getActiveSessions: vi.fn().mockReturnValue([]),
  cleanupSessions: vi.fn().mockResolvedValue(0),
  register: vi.fn(),
  createSession: vi.fn().mockResolvedValue({ name: 'mock-session' }),
  markCompletedByPhase: vi.fn(),
  markFailedByPhase: vi.fn(),
}));

const mockEndTokenWatcher = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  stopAll: vi.fn(),
  watch: vi.fn().mockResolvedValue(undefined),
}));

const mockTerminalStream = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  stopAll: vi.fn(),
}));

const mockPhaseHandlers = vi.hoisted(() => ({
  handlePending: vi.fn().mockResolvedValue({ canAdvance: true }),
  handleDesign: vi.fn().mockResolvedValue({ tmuxSession: 'mock-design-session' }),
  handleCoding: vi.fn().mockResolvedValue({ tmuxSession: 'mock-coding-session' }),
  handleTesting: vi.fn().mockResolvedValue({ tmuxSession: 'mock-testing-session' }),
  handleCodeReview: vi.fn().mockResolvedValue({ tmuxSession: 'mock-review-session' }),
  handleRunTestPlan: vi.fn().mockResolvedValue({ tmuxSession: 'mock-run-test-plan-session' }),
  handleDone: vi.fn().mockResolvedValue(undefined),
}));

const mockTmuxUtils = vi.hoisted(() => ({
  capturePane: vi.fn().mockResolvedValue(''),
  sessionName: vi.fn().mockReturnValue('mock-session-name'),
  buildSessionName: vi.fn().mockReturnValue('mock-session-name'),
}));

// Mock modules at the top level
vi.mock('@/lib/orchestration/tmux-manager', () => ({
  TmuxManager: class {
    spawnAgent = mockTmuxManager.spawnAgent;
    reconcile = mockTmuxManager.reconcile;
    getActiveSessions = mockTmuxManager.getActiveSessions;
    cleanupSessions = mockTmuxManager.cleanupSessions;
    register = mockTmuxManager.register;
    createSession = mockTmuxManager.createSession;
    markCompletedByPhase = mockTmuxManager.markCompletedByPhase;
    markFailedByPhase = mockTmuxManager.markFailedByPhase;
  },
}));

vi.mock('@/lib/orchestration/end-token-watcher', () => ({
  EndTokenWatcher: class {
    start = mockEndTokenWatcher.start;
    stop = mockEndTokenWatcher.stop;
    stopAll = mockEndTokenWatcher.stopAll;
    watch = mockEndTokenWatcher.watch;
  },
}));

vi.mock('@/lib/orchestration/terminal-stream', () => ({
  TerminalStream: class {
    static getInstance = vi.fn().mockReturnValue(mockTerminalStream);
  },
}));

vi.mock('@/lib/orchestration/phase-handlers/pending', () => ({
  handlePending: mockPhaseHandlers.handlePending,
}));

vi.mock('@/lib/orchestration/phase-handlers/design', () => ({
  handleDesign: mockPhaseHandlers.handleDesign,
}));

vi.mock('@/lib/orchestration/phase-handlers/coding', () => ({
  handleCoding: mockPhaseHandlers.handleCoding,
}));

vi.mock('@/lib/orchestration/phase-handlers/testing', () => ({
  handleTesting: mockPhaseHandlers.handleTesting,
}));

vi.mock('@/lib/orchestration/phase-handlers/code-review', () => ({
  handleCodeReview: mockPhaseHandlers.handleCodeReview,
}));

vi.mock('@/lib/orchestration/phase-handlers/run-test-plan', () => ({
  handleRunTestPlan: mockPhaseHandlers.handleRunTestPlan,
}));

vi.mock('@/lib/orchestration/phase-handlers/done', () => ({
  handleDone: mockPhaseHandlers.handleDone,
}));

vi.mock('@/lib/utils/tmux', () => ({
  capturePane: mockTmuxUtils.capturePane,
  sessionName: mockTmuxUtils.sessionName,
  buildSessionName: mockTmuxUtils.buildSessionName,
}));

// Mock adapters
vi.mock('@/lib/adapters/claude-code', () => ({
  ClaudeCodeAdapter: class {
    toolId = 'claude-code';
    launch = vi.fn();
  },
}));
vi.mock('@/lib/adapters/codex-cli', () => ({
  CodexCLIAdapter: class {
    toolId = 'codex-cli';
    launch = vi.fn();
  },
}));
vi.mock('@/lib/adapters/gemini-cli', () => ({
  GeminiCLIAdapter: class {
    toolId = 'gemini-cli';
    launch = vi.fn();
  },
}));
vi.mock('@/lib/adapters/opencode', () => ({
  OpenCodeAdapter: class {
    toolId = 'opencode';
    launch = vi.fn();
  },
}));

// Import after mocks are set up
import { OrchestrationEngine, type EngineConfig } from '@/lib/orchestration/engine';
import { YamlWriter } from '@/lib/yaml/writer';
import { YamlReader } from '@/lib/yaml/reader';
import { getDb, closeDb } from '@/lib/db';
import { tasks, activityEntries } from '@/lib/db/schema';

describe('Phase Transitions Integration', () => {
  let engine: OrchestrationEngine;
  let config: EngineConfig;
  let yamlWriter: YamlWriter;
  let yamlReader: YamlReader;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Reset mock implementations to defaults
    mockPhaseHandlers.handlePending.mockResolvedValue({ canAdvance: true });
    mockPhaseHandlers.handleDesign.mockResolvedValue({ tmuxSession: 'mock-design-session' });
    mockPhaseHandlers.handleCoding.mockResolvedValue({ tmuxSession: 'mock-coding-session' });
    mockPhaseHandlers.handleTesting.mockResolvedValue({ tmuxSession: 'mock-testing-session' });
    mockPhaseHandlers.handleCodeReview.mockResolvedValue({ tmuxSession: 'mock-review-session' });
    mockPhaseHandlers.handleRunTestPlan.mockResolvedValue({ tmuxSession: 'mock-run-test-plan-session' });
    mockPhaseHandlers.handleDone.mockResolvedValue(undefined);
    mockTmuxUtils.capturePane.mockResolvedValue('');
    mockTmuxManager.reconcile.mockResolvedValue([]);
    mockTmuxManager.getActiveSessions.mockReturnValue([]);
    mockTmuxManager.cleanupSessions.mockResolvedValue(0);

    // Clean up from previous tests
    OrchestrationEngine.resetInstance();

    // Create test directories
    fs.mkdirSync(TEST_PROJECT_ROOT, { recursive: true });
    fs.mkdirSync(TEST_MARK2_DIR, { recursive: true });
    fs.mkdirSync(path.join(TEST_MARK2_DIR, 'tasks'), { recursive: true });
    fs.mkdirSync(path.join(TEST_PROJECT_ROOT, '.worktrees'), { recursive: true });

    config = {
      projectRoot: TEST_PROJECT_ROOT,
      mark2Dir: TEST_MARK2_DIR,
      apiBaseUrl: 'http://localhost:3000',
      agentToken: 'test-token',
      basePort: 8000,
      portsPerTask: 10,
      maxLoopCount: 3,
    };

    yamlWriter = new YamlWriter(TEST_MARK2_DIR);
    yamlReader = new YamlReader(TEST_MARK2_DIR);

    // Create test task
    const testTask: Task = {
      id: TEST_TASK_ID,
      title: 'Phase Transition Test Task',
      description: 'A test task for phase transitions',
      phase: 'pending',
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
      auto_approve: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      phase_entered_at: new Date().toISOString(),
      loop_count: 0,
      archived: false,
    };
    yamlWriter.writeTask(testTask);

    // Initialize database
    const db = getDb(TEST_MARK2_DIR);
    db.insert(tasks).values({
      id: TEST_TASK_ID,
      title: testTask.title,
      description: testTask.description,
      phase: testTask.phase,
      priority: testTask.priority,
      created_by: testTask.created_by,
      merge_strategy: testTask.merge_strategy,
      created_at: testTask.created_at,
      updated_at: testTask.updated_at,
      phase_entered_at: testTask.phase_entered_at,
      loop_count: testTask.loop_count,
      phase_overrides_json: JSON.stringify(testTask.phase_overrides),
    }).run();

    engine = OrchestrationEngine.getInstance(config);

    // Spy on resolveAgent to return test role config based on phase
    vi.spyOn(engine as any, 'resolveAgent').mockImplementation((_task: unknown, phase: unknown) => {
      return {
        roleName: `test-${phase}`,
        role_prompt: `You are a test ${phase} agent`,
        cli_tool: 'claude-code',
        model: 'claude-3-sonnet',
        timeout_minutes: 30,
      };
    });
  });

  afterEach(() => {
    // Close database connection first
    closeDb();

    // Clean up test directory
    if (fs.existsSync(TEST_PROJECT_ROOT)) {
      fs.rmSync(TEST_PROJECT_ROOT, { recursive: true, force: true });
    }
    vi.clearAllMocks();
    OrchestrationEngine.resetInstance();
  });

  describe('Complete Phase Transition Flow', () => {
    it('transitions from pending to design', async () => {
      const db = getDb(TEST_MARK2_DIR);

      // Start with pending phase
      await engine.startPhase(TEST_TASK_ID, 'pending');

      // Verify task advanced to design (pending auto-advances when canAdvance: true)
      const taskAfterPending = db.select().from(tasks).where(eq(tasks.id, TEST_TASK_ID)).get();
      expect(taskAfterPending?.phase).toBe('design');
    });

    it('transitions from design to coding on DESIGN_COMPLETED', async () => {
      const db = getDb(TEST_MARK2_DIR);

      // Set task to design phase
      db.update(tasks).set({ phase: 'design' }).where(eq(tasks.id, TEST_TASK_ID)).run();
      const task = yamlReader.readTask(TEST_TASK_ID).data!;
      task.phase = 'design';
      yamlWriter.writeTask(task);

      // Process end token
      await engine.processEndToken(TEST_TASK_ID, 'test-designer', 'design', '[DESIGN_COMPLETED]');

      // Verify task advanced to coding
      const taskAfterDesign = db.select().from(tasks).where(eq(tasks.id, TEST_TASK_ID)).get();
      expect(taskAfterDesign?.phase).toBe('coding');
    });

    it('transitions from coding to testing on CODING_COMPLETED', async () => {
      const db = getDb(TEST_MARK2_DIR);

      // Set task to coding phase
      db.update(tasks).set({ phase: 'coding' }).where(eq(tasks.id, TEST_TASK_ID)).run();
      const task = yamlReader.readTask(TEST_TASK_ID).data!;
      task.phase = 'coding';
      yamlWriter.writeTask(task);

      // Process end token
      await engine.processEndToken(TEST_TASK_ID, 'test-coder', 'coding', '[CODING_COMPLETED]');

      // Verify task advanced to testing
      const taskAfterCoding = db.select().from(tasks).where(eq(tasks.id, TEST_TASK_ID)).get();
      expect(taskAfterCoding?.phase).toBe('testing');
    });

    it('transitions from testing to code_review on TESTING_PASSED', async () => {
      const db = getDb(TEST_MARK2_DIR);

      // Set task to testing phase
      db.update(tasks).set({ phase: 'testing' }).where(eq(tasks.id, TEST_TASK_ID)).run();
      const task = yamlReader.readTask(TEST_TASK_ID).data!;
      task.phase = 'testing';
      yamlWriter.writeTask(task);

      // Process end token
      await engine.processEndToken(TEST_TASK_ID, 'test-tester', 'testing', '[TESTING_PASSED]');

      // Verify task advanced to code_review
      const taskAfterTesting = db.select().from(tasks).where(eq(tasks.id, TEST_TASK_ID)).get();
      expect(taskAfterTesting?.phase).toBe('code_review');
    });

    it('loops back to coding on TESTING_FAILED', async () => {
      const db = getDb(TEST_MARK2_DIR);

      // Set task to testing phase
      db.update(tasks).set({ phase: 'testing', loop_count: 0 }).where(eq(tasks.id, TEST_TASK_ID)).run();
      const task = yamlReader.readTask(TEST_TASK_ID).data!;
      task.phase = 'testing';
      task.loop_count = 0;
      yamlWriter.writeTask(task);

      // Mock the capture pane for test failures
      mockTmuxUtils.capturePane.mockResolvedValue('Test failure: AssertionError');

      // Process end token
      await engine.processEndToken(TEST_TASK_ID, 'test-tester', 'testing', '[TESTING_FAILED]');

      // Verify task looped back to coding with incremented loop count
      const taskAfterFailure = db.select().from(tasks).where(eq(tasks.id, TEST_TASK_ID)).get();
      expect(taskAfterFailure?.phase).toBe('coding');
      expect(taskAfterFailure?.loop_count).toBe(1);
    });

    it('completes pipeline from code_review to done', async () => {
      const db = getDb(TEST_MARK2_DIR);

      // Set task to code_review phase
      db.update(tasks).set({ phase: 'code_review' }).where(eq(tasks.id, TEST_TASK_ID)).run();
      const task = yamlReader.readTask(TEST_TASK_ID).data!;
      task.phase = 'code_review';
      yamlWriter.writeTask(task);

      // Complete review (no autofix)
      await engine.processEndToken(TEST_TASK_ID, 'test-reviewer', 'code_review', '[REVIEW_COMPLETED]');
      expect(db.select().from(tasks).where(eq(tasks.id, TEST_TASK_ID)).get()?.phase).toBe('run_test_plan');

      // Update YAML for run_test_plan phase
      const taskForRunTestPlan = yamlReader.readTask(TEST_TASK_ID).data!;
      taskForRunTestPlan.phase = 'run_test_plan';
      yamlWriter.writeTask(taskForRunTestPlan);

      // Complete run_test_plan
      await engine.processEndToken(TEST_TASK_ID, 'test-manual', 'run_test_plan', '[RUN_TEST_PLAN_PASSED]');
      expect(db.select().from(tasks).where(eq(tasks.id, TEST_TASK_ID)).get()?.phase).toBe('done');
    });
  });

  describe('Activity Logging', () => {
    it('logs phase transitions', async () => {
      const db = getDb(TEST_MARK2_DIR);

      await engine.startPhase(TEST_TASK_ID, 'pending');

      const activities = db.select().from(activityEntries)
        .where(eq(activityEntries.task_id, TEST_TASK_ID))
        .all();

      // Should have logged some activity
      expect(activities.length).toBeGreaterThan(0);

      // Look for phase change activity
      const phaseChangeActivities = activities.filter(a => a.type === 'phase_change');
      expect(phaseChangeActivities.length).toBeGreaterThan(0);
    });

    it('logs end token detection', async () => {
      const db = getDb(TEST_MARK2_DIR);

      // Set task to design phase
      db.update(tasks).set({ phase: 'design' }).where(eq(tasks.id, TEST_TASK_ID)).run();
      const task = yamlReader.readTask(TEST_TASK_ID).data!;
      task.phase = 'design';
      yamlWriter.writeTask(task);

      await engine.processEndToken(TEST_TASK_ID, 'test-designer', 'design', '[DESIGN_COMPLETED]');

      const activities = db.select().from(activityEntries)
        .where(eq(activityEntries.task_id, TEST_TASK_ID))
        .all();

      const endTokenActivity = activities.find(a =>
        a.message?.includes('End token detected') || a.message?.includes('[DESIGN_COMPLETED]')
      );
      expect(endTokenActivity).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('handles agent crashes', async () => {
      const db = getDb(TEST_MARK2_DIR);

      await engine.handleAgentCrash(TEST_TASK_ID, 'test-coder', 'coding');

      const activities = db.select().from(activityEntries)
        .where(eq(activityEntries.task_id, TEST_TASK_ID))
        .all();

      const crashActivity = activities.find(a =>
        a.message?.includes('crashed') || a.type === 'error'
      );
      expect(crashActivity).toBeDefined();
    });
  });

  describe('Recovery and Cleanup', () => {
    it('recovers from startup correctly', async () => {
      const result = await engine.recoverOnStartup();

      expect(result).toHaveProperty('orphaned');
      expect(result).toHaveProperty('reattached');
      expect(typeof result.orphaned).toBe('number');
      expect(typeof result.reattached).toBe('number');
    });

    it('cleans up all sessions', async () => {
      const cleanedCount = await engine.cleanupAll();
      expect(typeof cleanedCount).toBe('number');
    });

    it('shuts down gracefully', () => {
      expect(() => engine.shutdown()).not.toThrow();
    });
  });
});
