import {
  sqliteTable,
  text,
  integer,
  index,
} from 'drizzle-orm/sqlite-core';

// ── Tasks ────────────────────────────────────────────────────────────────────
export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    phase: text('phase').notNull().default('pending'),
    priority: text('priority').notNull().default('P2'),
    story_id: text('story_id'),
    parent_task: text('parent_task'),
    created_by: text('created_by').notNull(),
    merge_strategy: text('merge_strategy').notNull().default('squash'),
    auto_advance: integer('auto_advance', { mode: 'boolean' }).notNull().default(true),
    auto_approve: integer('auto_approve', { mode: 'boolean' }).notNull().default(false),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
    phase_entered_at: text('phase_entered_at').notNull(),
    loop_count: integer('loop_count').notNull().default(0),
    // JSON text columns for array/object fields
    // Deprecated: use phase_overrides_json instead
    phase_agents_json: text('phase_agents_json').notNull().default('{}'),
    // New: phase-specific overrides for role, cli_tool, model
    phase_overrides_json: text('phase_overrides_json').notNull().default('{}'),
    blockers_json: text('blockers_json').notNull().default('[]'),
    artifacts_json: text('artifacts_json').notNull().default('[]'),
    ports_json: text('ports_json').notNull().default('[]'),
    worktrees_json: text('worktrees_json').notNull().default('{}'),
  },
  (table) => [
    index('idx_tasks_phase').on(table.phase),
    index('idx_tasks_priority').on(table.priority),
    index('idx_tasks_story_id').on(table.story_id),
    index('idx_tasks_parent_task').on(table.parent_task),
  ],
);;

// ── Stories ──────────────────────────────────────────────────────────────────
export const stories = sqliteTable('stories', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  created_by: text('created_by').notNull(),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  tasks_json: text('tasks_json').notNull().default('[]'),
});

// ── Activity Entries ─────────────────────────────────────────────────────────
export const activityEntries = sqliteTable(
  'activity_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    task_id: text('task_id').notNull(),
    timestamp: text('timestamp').notNull(),
    source: text('source').notNull(),
    type: text('type').notNull(),
    message: text('message').notNull(),
    metadata_json: text('metadata_json'),
  },
  (table) => [
    index('idx_activity_task_id').on(table.task_id),
    index('idx_activity_timestamp').on(table.timestamp),
  ],
);

// ── Port Allocations (runtime only) ─────────────────────────────────────────
export const portAllocations = sqliteTable('port_allocations', {
  task_id: text('task_id').primaryKey(),
  ports_json: text('ports_json').notNull(),
  services_json: text('services_json').notNull().default('{}'),
  allocated_at: text('allocated_at').notNull(),
});

// ── Worktree Records ────────────────────────────────────────────────────────
export const worktreeRecords = sqliteTable(
  'worktree_records',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    task_id: text('task_id').notNull(),
    agent_name: text('agent_name').notNull(),
    worktree_path: text('worktree_path').notNull(),
    branch_name: text('branch_name').notNull(),
    created_at: text('created_at').notNull(),
    status: text('status').notNull().default('active'),
  },
  (table) => [
    index('idx_worktrees_task_id').on(table.task_id),
    index('idx_worktrees_status').on(table.status),
  ],
);

// ── Agent Sessions ──────────────────────────────────────────────────────────
export const agentSessions = sqliteTable(
  'agent_sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    task_id: text('task_id').notNull(),
    agent_name: text('agent_name').notNull(),
    phase: text('phase').notNull(),
    tmux_session: text('tmux_session').notNull(),
    pid: integer('pid'),
    started_at: text('started_at').notNull(),
    ended_at: text('ended_at'),
    exit_code: integer('exit_code'),
    status: text('status').notNull().default('running'),
  },
  (table) => [
    index('idx_sessions_task_id').on(table.task_id),
    index('idx_sessions_status').on(table.status),
  ],
);

// ── ID Counters ─────────────────────────────────────────────────────────────
export const idCounters = sqliteTable('id_counters', {
  entity_type: text('entity_type').primaryKey(),
  next_id: integer('next_id').notNull().default(1),
});

// ── Corrupt Files ───────────────────────────────────────────────────────────
export const corruptFiles = sqliteTable('corrupt_files', {
  file_path: text('file_path').primaryKey(),
  error_message: text('error_message').notNull(),
  detected_at: text('detected_at').notNull(),
  resolved: integer('resolved', { mode: 'boolean' }).notNull().default(false),
});
