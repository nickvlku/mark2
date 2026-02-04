import { z } from 'zod';

// ── Enums ──────────────────────────────────────────────────────────────

export const Phase = z.enum([
  'pending',
  'design',
  'coding',
  'testing',
  'code_review',
  'fix_review',
  'final_testing',
  'manual_testing',
  'done',
]);
export type Phase = z.infer<typeof Phase>;

// Phases that can have roles assigned to them
export const AssignablePhase = z.enum(['design', 'coding', 'testing', 'code_review', 'fix_review', 'final_testing', 'manual_testing']);
export type AssignablePhase = z.infer<typeof AssignablePhase>;
export const ASSIGNABLE_PHASES: AssignablePhase[] = ['design', 'coding', 'testing', 'code_review', 'fix_review', 'final_testing', 'manual_testing'];

export const Priority = z.enum(['P0', 'P1', 'P2', 'P3']);
export type Priority = z.infer<typeof Priority>;

export const StoryStatus = z.enum(['pending', 'in_progress', 'completed']);
export type StoryStatus = z.infer<typeof StoryStatus>;

export const MergeStrategy = z.enum(['squash', 'preserve']);
export type MergeStrategy = z.infer<typeof MergeStrategy>;

export const ReviewSeverity = z.enum(['P0', 'P1', 'P2']);
export type ReviewSeverity = z.infer<typeof ReviewSeverity>;

export const CLIToolEnum = z.enum(['claude-code', 'codex-cli', 'gemini-cli', 'opencode']);
export type CLITool = z.infer<typeof CLIToolEnum>;


// ── Enhancement Config ─────────────────────────────────────────────────

export const EnhanceConfigSchema = z.object({
  role: z.string().optional().default('task-enhancer'),
  cli_tool: CLIToolEnum.optional().default('claude-code'),
  model: z.string().optional().default('claude-sonnet-4-5'),
  timeout_minutes: z.number().int().positive().optional().default(30),
}).strict();
export type EnhanceConfig = z.infer<typeof EnhanceConfigSchema>;


// ── Role Definition (new decoupled model) ──────────────────────────────

export const RoleSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Role names must be lowercase alphanumeric with hyphens, starting with a letter'),
  uuid: z.string().uuid().optional(),
  description: z.string().optional(),
  role_prompt: z.string().min(1, 'Role prompt cannot be empty'),
  suggested_phases: z.array(AssignablePhase).default([]),
  timeout_minutes: z.number().int().positive().default(60),
}).strict();
export type Role = z.infer<typeof RoleSchema>;

export const RolesFileSchema = z.object({
  roles: z.array(RoleSchema).default([]),
}).strict();
export type RolesFile = z.infer<typeof RolesFileSchema>;

// ── Phase Default (new decoupled model) ────────────────────────────────

export const PhaseDefaultSchema = z.object({
  role: z.string().min(1),
  cli_tool: CLIToolEnum,
  model: z.string().min(1),
  timeout_minutes: z.number().int().positive().optional(),
  auto_advance: z.boolean().default(false),
}).strict();
export type PhaseDefault = z.infer<typeof PhaseDefaultSchema>;

// ── Task Phase Override ────────────────────────────────────────────────

export const TaskPhaseOverrideSchema = z.object({
  role: z.string().optional(),
  cli_tool: CLIToolEnum.optional(),
  model: z.string().optional(),
  timeout_minutes: z.number().int().positive().optional(),
}).strict();
export type TaskPhaseOverride = z.infer<typeof TaskPhaseOverrideSchema>;


// ── Task Artifact ──────────────────────────────────────────────────────

export const TaskArtifact = z.object({
  name: z.string(),
  phase: Phase,
  path: z.string(),
  mime_type: z.string().optional(),
  created_at: z.string().datetime(),
  source: z.enum(['agent', 'user', 'system']).default('agent'),
  original_filename: z.string().optional(),
  file_size: z.number().optional(),
});
export type TaskArtifact = z.infer<typeof TaskArtifact>;

// ── Task ───────────────────────────────────────────────────────────────

export const TaskSchema = z.object({
  id: z.string().regex(/^TASK-\d+$/),
  title: z.string().min(1).max(200),
  description: z.string(),
  phase: Phase.default('pending'),
  // Deprecated: use phase_overrides instead
  phase_agents: z.record(z.string(), z.string()).optional().default({}),
  // New: phase-specific overrides for role, cli_tool, model
  phase_overrides: z.record(z.string(), TaskPhaseOverrideSchema).optional().default({}),
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
  archived: z.boolean().default(false),
  archived_at: z.string().datetime().optional(),
});
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

// Legacy PhaseConfig (deprecated, for backwards compatibility)
export const LegacyPhaseConfig = z.object({
  default_agent: z.string().optional(),
  timeout_minutes: z.number().int().positive().default(60),
  auto_advance: z.boolean().default(false),
});
export type LegacyPhaseConfig = z.infer<typeof LegacyPhaseConfig>;

// New PhaseDefaultConfig that supports the decoupled role/cli/model
export const PhaseDefaultConfig = z.union([
  // New format: role + cli_tool + model
  PhaseDefaultSchema,
  // Legacy format: default_agent only (deprecated)
  LegacyPhaseConfig,
]);
export type PhaseDefaultConfig = z.infer<typeof PhaseDefaultConfig>;

// Alias for backwards compatibility
export const PhaseConfig = LegacyPhaseConfig;
export type PhaseConfig = LegacyPhaseConfig;

export const ConfigSchema = z.object({
  project_name: z.string(),
  base_port: z.number().int().default(3000),
  ports_per_task: z.number().int().default(10),
  auto_fix: z.object({
    P0: z.boolean().default(true),
    P1: z.boolean().default(false),
    P2: z.boolean().default(false),
  }).default({ P0: true, P1: false, P2: false }),
  phase_defaults: z.record(z.string(), PhaseDefaultConfig).default({}),
  max_loop_count: z.number().int().default(5),
  server_port: z.number().int().default(3100),
  merge_strategy: MergeStrategy.default('squash'),
  ide_commands: z.array(z.string()).default(['code', 'cursor', 'windsurf']),
  enhance_config: EnhanceConfigSchema.optional(),
});
export type Config = z.infer<typeof ConfigSchema>;


// ── Type aliases for import convenience ────────────────────────────────

export type ParseError = {
  file_path: string;
  error: string;
  preserved: boolean;
};

// ── Helper functions ───────────────────────────────────────────────────

/**
 * Check if a phase default config is in the new format (has role, cli_tool, model)
 */
export function isNewPhaseDefault(config: PhaseDefaultConfig): config is PhaseDefault {
  return 'role' in config && 'cli_tool' in config && 'model' in config;
}

/**
 * Check if a phase default config is in the legacy format (has default_agent)
 */
export function isLegacyPhaseDefault(config: PhaseDefaultConfig): config is LegacyPhaseConfig {
  return 'default_agent' in config || !('role' in config);
}
