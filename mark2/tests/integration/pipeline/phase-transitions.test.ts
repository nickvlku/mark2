import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { OrchestrationEngine, type EngineConfig } from '@/lib/orchestration/engine';
import { YamlWriter } from '@/lib/yaml/writer';
import { YamlReader } from '@/lib/yaml/reader';
import type { Task, AgentDefinition, AgentsFile } from '@/lib/yaml/schemas';
import { getDb } from '@/lib/db';
import { tasks, activityEntries } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Create a temporary directory for testing
const TEST_PROJECT_ROOT = '/tmp/mark2-phase-transition-test';
const TEST_MARK2_DIR = path.join(TEST_PROJECT_ROOT, '.mark2');
const TEST_TASK_ID = 'TASK-1';

describe('Phase Transitions Integration', () => {
  let engine: OrchestrationEngine;
  let config: EngineConfig;
  let yamlWriter: YamlWriter;
  let yamlReader: YamlReader;

  beforeEach(async () => {
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

    // Create test agents file
    const agentsFile: AgentsFile = {
      agents: [
        {
          name: 'test-designer',
          cli_tool: 'claude-code',
          model: 'claude-3-sonnet',
          timeout_minutes: 30,
        },
        {
          name: 'test-coder',
          cli_tool: 'claude-code',
          model: 'claude-3-sonnet',
          timeout_minutes: 45,
        },
        {
          name: 'test-reviewer',
          cli_tool: 'claude-code',
          model: 'claude-3-sonnet',
          timeout_minutes: 20,
        },
      ],
    };
    const agentsPath = path.join(TEST_MARK2_DIR, 'agents.yaml');
    const YAML = await import('yaml');
    fs.writeFileSync(agentsPath, YAML.stringify(agentsFile));

    // Create test task
    const testTask: Task = {
      id: TEST_TASK_ID,
      title: 'Phase Transition Test Task',
      description: 'A test task for phase transitions',
      phase: 'pending',
      assigned_agents: ['test-coder'],
      blockers: [],
      priority: 'P2',
      artifacts: [],
      ports: [],
      worktrees: {},
      created_by: 'test',
      merge_strategy: 'squash',
      auto_advance: true,
      auto_approve: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      phase_entered_at: new Date().toISOString(),
      loop_count: 0,
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
    }).run();

    // Mock phase handlers to avoid actual agent spawning
    vi.doMock('@/lib/orchestration/phase-handlers/pending', () => ({
      handlePending: vi.fn().mockResolvedValue({ canAdvance: true }),
    }));

    vi.doMock('@/lib/orchestration/phase-handlers/design', () => ({
      handleDesign: vi.fn().mockResolvedValue({ tmuxSession: 'mock-design-session' }),
    }));

    vi.doMock('@/lib/orchestration/phase-handlers/coding', () => ({
      handleCoding: vi.fn().mockResolvedValue({ tmuxSession: 'mock-coding-session' }),
    }));

    vi.doMock('@/lib/orchestration/phase-handlers/testing', () => ({
      handleTesting: vi.fn().mockResolvedValue({ tmuxSession: 'mock-testing-session' }),
    }));

    vi.doMock('@/lib/orchestration/phase-handlers/code-review', () => ({
      handleCodeReview: vi.fn().mockResolvedValue({ tmuxSession: 'mock-review-session' }),
    }));

    vi.doMock('@/lib/orchestration/phase-handlers/manual-testing', () => ({
      handleManualTesting: vi.fn().mockResolvedValue({ tmuxSession: 'mock-manual-session' }),
    }));

    vi.doMock('@/lib/orchestration/phase-handlers/done', () => ({
      handleDone: vi.fn().mockResolvedValue(undefined),
    }));

    // Mock TMUX operations
    vi.doMock('@/lib/orchestration/tmux-manager', () => {
      return {
        TmuxManager: vi.fn().mockImplementation(() => ({
          spawnAgent: vi.fn().mockResolvedValue('mock-session'),
          markCompleted: vi.fn(),
          markFailed: vi.fn(),
          reconcile: vi.fn().mockResolvedValue([]),
          getActiveSessions: vi.fn().mockReturnValue([]),
          cleanup: vi.fn().mockResolvedValue(0),
        })),
      };
    });

    // Mock end token watcher
    vi.doMock('@/lib/orchestration/end-token-watcher', () => {
      return {
        EndTokenWatcher: vi.fn().mockImplementation(() => ({
          watch: vi.fn(),
          stop: vi.fn(),
          stopAll: vi.fn(),
        })),
      };
    });

    engine = OrchestrationEngine.getInstance(config);
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_PROJECT_ROOT)) {
      fs.rmSync(TEST_PROJECT_ROOT, { recursive: true, force: true });
    }
    vi.clearAllMocks();
    OrchestrationEngine.resetInstance();
  });

  describe('Complete Phase Transition Flow', () => {
    it('transitions from pending to design to coding', async () => {
      const db = getDb(TEST_MARK2_DIR);

      // Start with pending phase
      await engine.startPhase(TEST_TASK_ID, 'pending');

      // Verify task advanced to design
      const taskAfterPending = db.select().from(tasks).where(eq(tasks.id, TEST_TASK_ID)).get();
      expect(taskAfterPending?.phase).toBe('design');

      // Simulate design completion
      await engine.processEndToken(TEST_TASK_ID, 'test-designer', 'design', '[DESIGN_COMPLETED]');

      // Verify task advanced to coding
      const taskAfterDesign = db.select().from(tasks).where(eq(tasks.id, TEST_TASK_ID)).get();
      expect(taskAfterDesign?.phase).toBe('coding');
    });

    it('handles testing failure loop back to coding', async () => {
      const db = getDb(TEST_MARK2_DIR);

      // Start task in testing phase
      await engine.startPhase(TEST_TASK_ID, 'testing');

      // Initial task should be in testing phase
      const taskBefore = db.select().from(tasks).where(eq(tasks.id, TEST_TASK_ID)).get();
      expect(taskBefore?.phase).toBe('testing');

      // Mock tmux capture for test failures
      vi.doMock('@/lib/utils/tmux', () => ({
        capturePane: vi.fn().mockResolvedValue('Test failure: AssertionError'),
        sessionName: vi.fn().mockReturnValue('mock-session-name'),
      }));

      // Simulate testing failure
      await engine.processEndToken(TEST_TASK_ID, 'test-coder', 'testing', '[TESTING_FAILED]');

      // Verify task looped back to coding
      const taskAfterFailure = db.select().from(tasks).where(eq(tasks.id, TEST_TASK_ID)).get();
      expect(taskAfterFailure?.phase).toBe('coding');
      expect(taskAfterFailure?.loop_count).toBe(1);
    });

    it('handles code review autofix loop back to coding', async () => {
      const db = getDb(TEST_MARK2_DIR);

      // Create worktree directory and review.md file
      const worktreePath = path.join(TEST_PROJECT_ROOT, '.worktrees', TEST_TASK_ID, 'design');
      fs.mkdirSync(worktreePath, { recursive: true });
      fs.writeFileSync(path.join(worktreePath, 'review.md'), 'Auto-fixable issues found:\\n- Missing type annotations');

      // Start task in code review phase
      await engine.startPhase(TEST_TASK_ID, 'code_review');

      // Simulate review completion with autofix
      await engine.processEndToken(TEST_TASK_ID, 'test-reviewer', 'code_review', '[REVIEW_COMPLETED]:autofix');

      // Verify task looped back to coding
      const taskAfterReview = db.select().from(tasks).where(eq(tasks.id, TEST_TASK_ID)).get();
      expect(taskAfterReview?.phase).toBe('coding');
      expect(taskAfterReview?.loop_count).toBe(1);
    });

    it('completes full pipeline: coding -> testing -> review -> manual -> done', async () => {
      const db = getDb(TEST_MARK2_DIR);

      // Start in coding phase
      await engine.startPhase(TEST_TASK_ID, 'coding');
      expect(db.select().from(tasks).where(eq(tasks.id, TEST_TASK_ID)).get()?.phase).toBe('coding');

      // Complete coding
      await engine.processEndToken(TEST_TASK_ID, 'test-coder', 'coding', '[CODING_COMPLETED]');
      expect(db.select().from(tasks).where(eq(tasks.id, TEST_TASK_ID)).get()?.phase).toBe('testing');

      // Pass testing
      await engine.processEndToken(TEST_TASK_ID, 'test-coder', 'testing', '[TESTING_PASSED]');
      expect(db.select().from(tasks).where(eq(tasks.id, TEST_TASK_ID)).get()?.phase).toBe('code_review');

      // Complete review (no autofix)
      await engine.processEndToken(TEST_TASK_ID, 'test-reviewer', 'code_review', '[REVIEW_COMPLETED]');
      expect(db.select().from(tasks).where(eq(tasks.id, TEST_TASK_ID)).get()?.phase).toBe('manual_testing');

      // Complete manual testing
      await engine.processEndToken(TEST_TASK_ID, 'test-coder', 'manual_testing', '[MANUAL_TESTING_READY]');
      expect(db.select().from(tasks).where(eq(tasks.id, TEST_TASK_ID)).get()?.phase).toBe('done');
    });

    it('enforces maximum loop count', async () => {
      const db = getDb(TEST_MARK2_DIR);

      // Set task to have high loop count
      db.update(tasks)
        .set({ loop_count: config.maxLoopCount! - 1, phase: 'testing' })
        .where(eq(tasks.id, TEST_TASK_ID))
        .run();

      // Update YAML as well
      const task = yamlReader.readTask(TEST_TASK_ID).data!;
      task.loop_count = config.maxLoopCount! - 1;
      task.phase = 'testing';
      yamlWriter.writeTask(task);

      // Start testing phase
      await engine.startPhase(TEST_TASK_ID, 'testing');

      // Simulate failure - should still allow one more loop
      await engine.processEndToken(TEST_TASK_ID, 'test-coder', 'testing', '[TESTING_FAILED]');
      
      const taskAfterLoop = db.select().from(tasks).where(eq(tasks.id, TEST_TASK_ID)).get();
      expect(taskAfterLoop?.phase).toBe('coding');
      expect(taskAfterLoop?.loop_count).toBe(config.maxLoopCount);
    });
  });

  describe('Activity Logging', () => {
    it('logs phase transitions', async () => {
      const db = getDb(TEST_MARK2_DIR);

      await engine.startPhase(TEST_TASK_ID, 'pending');
      await engine.processEndToken(TEST_TASK_ID, 'test-designer', 'design', '[DESIGN_COMPLETED]');

      const activities = db.select().from(activityEntries)
        .where(eq(activityEntries.task_id, TEST_TASK_ID))
        .all();

      const phaseChangeActivities = activities.filter(a => a.type === 'phase_change');
      expect(phaseChangeActivities.length).toBeGreaterThan(0);

      const transitionActivity = phaseChangeActivities.find(a => 
        a.message?.includes('design -> coding')
      );
      expect(transitionActivity).toBeDefined();
    });

    it('logs end token detection', async () => {
      const db = getDb(TEST_MARK2_DIR);

      await engine.startPhase(TEST_TASK_ID, 'design');
      await engine.processEndToken(TEST_TASK_ID, 'test-designer', 'design', '[DESIGN_COMPLETED]');

      const activities = db.select().from(activityEntries)
        .where(eq(activityEntries.task_id, TEST_TASK_ID))
        .all();

      const endTokenActivity = activities.find(a => 
        a.message?.includes('End token detected: [DESIGN_COMPLETED]')
      );
      expect(endTokenActivity).toBeDefined();
      expect(endTokenActivity?.source).toBe('orchestration');
      expect(endTokenActivity?.type).toBe('note');
    });

    it('logs invalid transition attempts', async () => {
      const db = getDb(TEST_MARK2_DIR);

      await engine.startPhase(TEST_TASK_ID, 'design');
      await engine.processEndToken(TEST_TASK_ID, 'test-designer', 'design', '[INVALID_TOKEN]');

      const activities = db.select().from(activityEntries)
        .where(eq(activityEntries.task_id, TEST_TASK_ID))
        .all();

      const errorActivity = activities.find(a => 
        a.message?.includes('No valid transition found for token \"[INVALID_TOKEN]\"')
      );
      expect(errorActivity).toBeDefined();
      expect(errorActivity?.type).toBe('error');
    });
  });

  describe('Error Handling', () => {
    it('handles missing task gracefully', async () => {
      await expect(
        engine.processEndToken('NONEXISTENT', 'test-agent', 'coding', '[CODING_COMPLETED]')
      ).rejects.toThrow('Task NONEXISTENT not found');
    });

    it('handles agent crashes', async () => {
      const db = getDb(TEST_MARK2_DIR);

      await engine.handleAgentCrash(TEST_TASK_ID, 'test-coder', 'coding');

      const activities = db.select().from(activityEntries)
        .where(eq(activityEntries.task_id, TEST_TASK_ID))
        .all();

      const crashActivity = activities.find(a => 
        a.message?.includes('Agent \"test-coder\" crashed during phase \"coding\"')
      );
      expect(crashActivity).toBeDefined();
      expect(crashActivity?.type).toBe('error');
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