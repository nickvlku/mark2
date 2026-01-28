import { z } from 'zod';

// ── Enums ──────────────────────────────────────────────────────────────

export const Phase = z.enum([
  'pending',
  'design',
  'coding',
  'testing',
  'code_review',
  'manual_testing',
  'done',
]);
export type Phase = z.infer<typeof Phase>;

export const Priority = z.enum(['P0', 'P1', 'P2', 'P3']);
export type Priority = z.infer<typeof Priority>;

export const StoryStatus = z.enum(['pending', 'in_progress', 'completed']);
export type StoryStatus = z.infer<typeof StoryStatus>;

export const MergeStrategy = z.enum(['squash', 'preserve']);
export type MergeStrategy = z.infer<typeof MergeStrategy>;

export const ReviewSeverity = z.enum(['P0', 'P1', 'P2']);
export type ReviewSeverity = z.infer<typeof ReviewSeverity>;

// ── Agent Definition ───────────────────────────────────────────────────

export const AgentDefinitionSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Agent names must be lowercase alphanumeric with hyphens, starting with a letter'),
  cli_tool: z.enum(['claude-code', 'codex-cli', 'gemini-cli', 'opencode']),
  model: z.string().min(1, 'Model cannot be empty'),
  role_prompt: z.string().min(1, 'Role prompt cannot be empty'),
  timeout_minutes: z.number().int().positive().default(60),
}).strict();
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

// ── Task Artifact ──────────────────────────────────────────────────────

export const TaskArtifact = z.object({
  name: z.string(),
  phase: Phase,
  path: z.string(),
  mime_type: z.string().optional(),
  created_at: z.string().datetime(),
});
export type TaskArtifact = z.infer<typeof TaskArtifact>;

// ── Task ───────────────────────────────────────────────────────────────

export const TaskSchema = z.object({
  id: z.string().regex(/^TASK-\d+$/),
  title: z.string().min(1).max(200),
  description: z.string(),
  phase: Phase.default('pending'),
  assigned_agents: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),
  priority: Priority.default('P2'),
  artifacts: z.array(TaskArtifact).default([]),
  ports: z.array(z.number().int()).default([]),
  worktrees: z.record(z.string(), z.string()).default({}),
  created_by: z.string(),
  story_id: z.string().regex(/^STORY-\d+$/).optional(),
  parent_task: z.string().regex(/^TASK-\d+$/).optional(),
  merge_strategy: MergeStrategy.default('squash'),
  auto_advance: z.boolean().default(true),
  auto_approve: z.boolean().default(false),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  phase_entered_at: z.string().datetime(),
  loop_count: z.number().int().default(0),
});;
export type Task = z.infer<typeof TaskSchema>;

// ── Activity Log Entry ─────────────────────────────────────────────────

export const ActivityEntry = z.object({
  timestamp: z.string().datetime(),
  source: z.string(),
  type: z.enum(['note', 'phase_change', 'artifact', 'error', 'comment']),
  message: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ActivityEntry = z.infer<typeof ActivityEntry>;

export const ActivityLog = z.object({
  task_id: z.string().regex(/^TASK-\d+$/),
  entries: z.array(ActivityEntry).default([]),
});
export type ActivityLog = z.infer<typeof ActivityLog>;

// ── Story ──────────────────────────────────────────────────────────────

export const StorySchema = z.object({
  id: z.string().regex(/^STORY-\d+$/),
  title: z.string().min(1).max(200),
  description: z.string(),
  tasks: z.array(z.string()).default([]),
  created_by: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Story = z.infer<typeof StorySchema>;

// ── Project Config ─────────────────────────────────────────────────────

export const PhaseConfig = z.object({
  default_agent: z.string().optional(),
  timeout_minutes: z.number().int().positive().default(60),
  auto_advance: z.boolean().default(false),
});
export type PhaseConfig = z.infer<typeof PhaseConfig>;

export const ConfigSchema = z.object({
  project_name: z.string(),
  base_port: z.number().int().default(3000),
  ports_per_task: z.number().int().default(10),
  auto_fix: z.object({
    P0: z.boolean().default(true),
    P1: z.boolean().default(false),
    P2: z.boolean().default(false),
  }).default({ P0: true, P1: false, P2: false }),
  phase_defaults: z.record(z.string(), PhaseConfig).default({}),
  max_loop_count: z.number().int().default(5),
  server_port: z.number().int().default(3100),
  merge_strategy: MergeStrategy.default('squash'),
});
export type Config = z.infer<typeof ConfigSchema>;

// ── Agents File ────────────────────────────────────────────────────────

export const AgentsFileSchema = z.object({
  agents: z.array(AgentDefinitionSchema).default([]),
}).strict();
export type AgentsFile = z.infer<typeof AgentsFileSchema>;

// ── Type aliases for import convenience ────────────────────────────────

export type ParseError = {
  file_path: string;
  error: string;
  preserved: boolean;
};
