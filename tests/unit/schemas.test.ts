import { describe, it, expect } from 'vitest';
import {
  TaskSchema,
  Phase,
  Priority,
  StorySchema,
  ActivityEntry,
  ActivityLog,
  ConfigSchema,
  AgentDefinitionSchema,
  StoryStatus,
  MergeStrategy,
  ReviewSeverity,
  TaskArtifact,
} from '@/lib/yaml/schemas';

const NOW = '2025-01-15T10:00:00.000Z';

function makeValidTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'TASK-1',
    title: 'Implement feature X',
    description: 'Detailed description here',
    phase: 'pending',
    phase_agents: {},
    blockers: [],
    priority: 'P2',
    artifacts: [],
    ports: [],
    worktrees: {},
    created_by: 'human',
    merge_strategy: 'squash',
    auto_advance: true,
    auto_approve: false,
    created_at: NOW,
    updated_at: NOW,
    phase_entered_at: NOW,
    loop_count: 0,
    ...overrides,
  };
}

describe('Zod Schemas', () => {
  // ── Phase enum ──────────────────────────────────────────────────────
  describe('Phase', () => {
    it('accepts all valid phases', () => {
      const phases = ['pending', 'design', 'coding', 'testing', 'code_review', 'manual_testing', 'done'];
      for (const p of phases) {
        expect(Phase.parse(p)).toBe(p);
      }
    });

    it('rejects invalid phase values', () => {
      expect(() => Phase.parse('invalid')).toThrow();
      expect(() => Phase.parse('PENDING')).toThrow();
      expect(() => Phase.parse('')).toThrow();
    });
  });

  // ── Priority enum ───────────────────────────────────────────────────
  describe('Priority', () => {
    it('accepts P0-P3', () => {
      for (const p of ['P0', 'P1', 'P2', 'P3']) {
        expect(Priority.parse(p)).toBe(p);
      }
    });

    it('rejects invalid priority', () => {
      expect(() => Priority.parse('P4')).toThrow();
      expect(() => Priority.parse('p0')).toThrow();
      expect(() => Priority.parse('high')).toThrow();
    });
  });

  // ── StoryStatus enum ───────────────────────────────────────────────
  describe('StoryStatus', () => {
    it('accepts valid statuses', () => {
      for (const s of ['pending', 'in_progress', 'completed']) {
        expect(StoryStatus.parse(s)).toBe(s);
      }
    });

    it('rejects invalid status', () => {
      expect(() => StoryStatus.parse('active')).toThrow();
    });
  });

  // ── MergeStrategy enum ─────────────────────────────────────────────
  describe('MergeStrategy', () => {
    it('accepts squash and preserve', () => {
      expect(MergeStrategy.parse('squash')).toBe('squash');
      expect(MergeStrategy.parse('preserve')).toBe('preserve');
    });

    it('rejects invalid strategy', () => {
      expect(() => MergeStrategy.parse('rebase')).toThrow();
    });
  });

  // ── ReviewSeverity enum ────────────────────────────────────────────
  describe('ReviewSeverity', () => {
    it('accepts P0, P1, P2', () => {
      for (const s of ['P0', 'P1', 'P2']) {
        expect(ReviewSeverity.parse(s)).toBe(s);
      }
    });

    it('rejects P3', () => {
      expect(() => ReviewSeverity.parse('P3')).toThrow();
    });
  });

  // ── TaskSchema ──────────────────────────────────────────────────────
  describe('TaskSchema', () => {
    it('parses a valid task with all fields', () => {
      const input = makeValidTask();
      const result = TaskSchema.parse(input);
      expect(result.id).toBe('TASK-1');
      expect(result.title).toBe('Implement feature X');
      expect(result.phase).toBe('pending');
      expect(result.priority).toBe('P2');
      expect(result.phase_agents).toEqual({});
      expect(result.blockers).toEqual([]);
      expect(result.artifacts).toEqual([]);
      expect(result.ports).toEqual([]);
      expect(result.worktrees).toEqual({});
      expect(result.loop_count).toBe(0);
      expect(result.merge_strategy).toBe('squash');
    });

    it('fills in defaults for optional fields', () => {
      const minimal = {
        id: 'TASK-5',
        title: 'Minimal task',
        description: 'desc',
        created_by: 'human',
        created_at: NOW,
        updated_at: NOW,
        phase_entered_at: NOW,
      };
      const result = TaskSchema.parse(minimal);
      expect(result.phase).toBe('pending');
      expect(result.priority).toBe('P2');
      expect(result.phase_agents).toEqual({});
      expect(result.blockers).toEqual([]);
      expect(result.artifacts).toEqual([]);
      expect(result.ports).toEqual([]);
      expect(result.worktrees).toEqual({});
      expect(result.loop_count).toBe(0);
      expect(result.merge_strategy).toBe('squash');
    });

    it('rejects task ID not matching TASK-\\d+', () => {
      expect(() => TaskSchema.parse(makeValidTask({ id: 'task-1' }))).toThrow();
      expect(() => TaskSchema.parse(makeValidTask({ id: 'TASK-' }))).toThrow();
      expect(() => TaskSchema.parse(makeValidTask({ id: 'STORY-1' }))).toThrow();
      expect(() => TaskSchema.parse(makeValidTask({ id: '' }))).toThrow();
      expect(() => TaskSchema.parse(makeValidTask({ id: 'TASK-abc' }))).toThrow();
    });

    it('rejects empty title', () => {
      expect(() => TaskSchema.parse(makeValidTask({ title: '' }))).toThrow();
    });

    it('rejects title over 200 chars', () => {
      expect(() => TaskSchema.parse(makeValidTask({ title: 'x'.repeat(201) }))).toThrow();
    });

    it('accepts valid story_id and parent_task references', () => {
      const result = TaskSchema.parse(
        makeValidTask({ story_id: 'STORY-1', parent_task: 'TASK-99' }),
      );
      expect(result.story_id).toBe('STORY-1');
      expect(result.parent_task).toBe('TASK-99');
    });

    it('rejects invalid story_id format', () => {
      expect(() => TaskSchema.parse(makeValidTask({ story_id: 'bad' }))).toThrow();
    });

    it('rejects invalid parent_task format', () => {
      expect(() => TaskSchema.parse(makeValidTask({ parent_task: 'STORY-1' }))).toThrow();
    });

    it('validates artifacts array with proper shape', () => {
      const artifact = {
        name: 'design-doc',
        phase: 'design',
        path: '/artifacts/design.md',
        created_at: NOW,
      };
      const result = TaskSchema.parse(makeValidTask({ artifacts: [artifact] }));
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].name).toBe('design-doc');
    });
  });

  // ── TaskArtifact ────────────────────────────────────────────────────
  describe('TaskArtifact', () => {
    it('validates a complete artifact', () => {
      const input = {
        name: 'design-doc',
        phase: 'design',
        path: '/tmp/design.md',
        mime_type: 'text/markdown',
        created_at: NOW,
      };
      const result = TaskArtifact.parse(input);
      expect(result.name).toBe('design-doc');
      expect(result.mime_type).toBe('text/markdown');
    });

    it('allows optional mime_type', () => {
      const input = {
        name: 'artifact',
        phase: 'coding',
        path: '/tmp/file.ts',
        created_at: NOW,
      };
      const result = TaskArtifact.parse(input);
      expect(result.mime_type).toBeUndefined();
    });
  });

  // ── ActivityEntry ───────────────────────────────────────────────────
  describe('ActivityEntry', () => {
    it('validates a proper entry', () => {
      const input = {
        timestamp: NOW,
        source: 'system',
        type: 'phase_change',
        message: 'Phase changed to coding',
      };
      const result = ActivityEntry.parse(input);
      expect(result.type).toBe('phase_change');
    });

    it('accepts all valid types', () => {
      const types = ['note', 'phase_change', 'artifact', 'error', 'comment'];
      for (const t of types) {
        const input = {
          timestamp: NOW,
          source: 'test',
          type: t,
          message: 'test message',
        };
        expect(ActivityEntry.parse(input).type).toBe(t);
      }
    });

    it('rejects invalid type', () => {
      expect(() =>
        ActivityEntry.parse({
          timestamp: NOW,
          source: 'test',
          type: 'invalid_type',
          message: 'msg',
        }),
      ).toThrow();
    });

    it('accepts optional metadata', () => {
      const result = ActivityEntry.parse({
        timestamp: NOW,
        source: 'system',
        type: 'note',
        message: 'msg',
        metadata: { key: 'value' },
      });
      expect(result.metadata).toEqual({ key: 'value' });
    });
  });

  // ── ActivityLog ─────────────────────────────────────────────────────
  describe('ActivityLog', () => {
    it('validates activity log with entries', () => {
      const result = ActivityLog.parse({
        task_id: 'TASK-1',
        entries: [
          { timestamp: NOW, source: 'system', type: 'note', message: 'Started' },
        ],
      });
      expect(result.task_id).toBe('TASK-1');
      expect(result.entries).toHaveLength(1);
    });

    it('defaults entries to empty array', () => {
      const result = ActivityLog.parse({ task_id: 'TASK-1' });
      expect(result.entries).toEqual([]);
    });
  });

  // ── StorySchema ─────────────────────────────────────────────────────
  describe('StorySchema', () => {
    it('validates a complete story', () => {
      const input = {
        id: 'STORY-1',
        title: 'User authentication',
        description: 'Implement auth',
        tasks: ['TASK-1', 'TASK-2'],
        created_by: 'human',
        created_at: NOW,
        updated_at: NOW,
      };
      const result = StorySchema.parse(input);
      expect(result.id).toBe('STORY-1');
      expect(result.tasks).toEqual(['TASK-1', 'TASK-2']);
    });

    it('rejects invalid story ID', () => {
      expect(() =>
        StorySchema.parse({
          id: 'TASK-1',
          title: 'Bad',
          description: 'desc',
          created_by: 'human',
          created_at: NOW,
          updated_at: NOW,
        }),
      ).toThrow();
    });

    it('defaults tasks to empty array', () => {
      const result = StorySchema.parse({
        id: 'STORY-5',
        title: 'Title',
        description: 'desc',
        created_by: 'human',
        created_at: NOW,
        updated_at: NOW,
      });
      expect(result.tasks).toEqual([]);
    });
  });

  // ── ConfigSchema ────────────────────────────────────────────────────
  describe('ConfigSchema', () => {
    it('fills defaults for minimal config', () => {
      const result = ConfigSchema.parse({ project_name: 'myproject' });
      expect(result.project_name).toBe('myproject');
      expect(result.base_port).toBe(3000);
      expect(result.ports_per_task).toBe(10);
      expect(result.auto_fix).toEqual({ P0: true, P1: false, P2: false });
      expect(result.phase_defaults).toEqual({});
      expect(result.max_loop_count).toBe(5);
      expect(result.server_port).toBe(3100);
      expect(result.merge_strategy).toBe('squash');
    });

    it('accepts custom config values', () => {
      const result = ConfigSchema.parse({
        project_name: 'custom',
        base_port: 5000,
        ports_per_task: 20,
        max_loop_count: 10,
        server_port: 8080,
        merge_strategy: 'preserve',
      });
      expect(result.base_port).toBe(5000);
      expect(result.ports_per_task).toBe(20);
      expect(result.max_loop_count).toBe(10);
      expect(result.server_port).toBe(8080);
      expect(result.merge_strategy).toBe('preserve');
    });
  });

  // ── AgentDefinitionSchema ───────────────────────────────────────────
  describe('AgentDefinitionSchema', () => {
    it('validates a proper agent definition', () => {
      const input = {
        name: 'design-agent',
        cli_tool: 'claude-code',
        model: 'claude-sonnet-4-5',
        phase: 'design',
        role_prompt: 'You are a design agent.',
        timeout_minutes: 30,
      };
      const result = AgentDefinitionSchema.parse(input);
      expect(result.name).toBe('design-agent');
      expect(result.cli_tool).toBe('claude-code');
      expect(result.phase).toBe('design');
    });

    it('validates all cli_tool enum values', () => {
      const tools = ['claude-code', 'codex-cli', 'gemini-cli', 'opencode'];
      for (const tool of tools) {
        const result = AgentDefinitionSchema.parse({
          name: 'agent',
          cli_tool: tool,
          model: 'model',
          phase: 'coding',
          role_prompt: 'prompt',
        });
        expect(result.cli_tool).toBe(tool);
      }
    });

    it('validates all phase enum values', () => {
      const phases = ['design', 'coding', 'testing', 'code_review', 'manual_testing'];
      for (const phase of phases) {
        const result = AgentDefinitionSchema.parse({
          name: 'agent',
          cli_tool: 'claude-code',
          model: 'model',
          phase,
          role_prompt: 'prompt',
        });
        expect(result.phase).toBe(phase);
      }
    });

    it('rejects invalid cli_tool', () => {
      expect(() =>
        AgentDefinitionSchema.parse({
          name: 'agent',
          cli_tool: 'unknown-tool',
          model: 'model',
          phase: 'coding',
          role_prompt: 'prompt',
        }),
      ).toThrow();
    });

    it('rejects invalid phase', () => {
      expect(() =>
        AgentDefinitionSchema.parse({
          name: 'agent',
          cli_tool: 'claude-code',
          model: 'model',
          phase: 'invalid-phase',
          role_prompt: 'prompt',
        }),
      ).toThrow();
    });

    it('rejects agent name with uppercase or special chars', () => {
      expect(() =>
        AgentDefinitionSchema.parse({
          name: 'Design_Agent',
          cli_tool: 'claude-code',
          model: 'model',
          phase: 'design',
          role_prompt: 'prompt',
        }),
      ).toThrow();
    });

    it('defaults timeout_minutes to 60', () => {
      const result = AgentDefinitionSchema.parse({
        name: 'agent',
        cli_tool: 'claude-code',
        model: 'model',
        phase: 'coding',
        role_prompt: 'prompt',
      });
      expect(result.timeout_minutes).toBe(60);
    });
  });
});
