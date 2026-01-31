CREATE TABLE `activity_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`source` text NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`metadata_json` text
);
--> statement-breakpoint
CREATE INDEX `idx_activity_task_id` ON `activity_entries` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_activity_timestamp` ON `activity_entries` (`timestamp`);--> statement-breakpoint
CREATE TABLE `agent_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` text NOT NULL,
	`agent_name` text NOT NULL,
	`phase` text NOT NULL,
	`tmux_session` text NOT NULL,
	`pid` integer,
	`started_at` text NOT NULL,
	`ended_at` text,
	`exit_code` integer,
	`status` text DEFAULT 'running' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_task_id` ON `agent_sessions` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_status` ON `agent_sessions` (`status`);--> statement-breakpoint
CREATE TABLE `corrupt_files` (
	`file_path` text PRIMARY KEY NOT NULL,
	`error_message` text NOT NULL,
	`detected_at` text NOT NULL,
	`resolved` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `id_counters` (
	`entity_type` text PRIMARY KEY NOT NULL,
	`next_id` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `port_allocations` (
	`task_id` text PRIMARY KEY NOT NULL,
	`ports_json` text NOT NULL,
	`services_json` text DEFAULT '{}' NOT NULL,
	`allocated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stories` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`tasks_json` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`phase` text DEFAULT 'pending' NOT NULL,
	`priority` text DEFAULT 'P2' NOT NULL,
	`story_id` text,
	`parent_task` text,
	`created_by` text NOT NULL,
	`merge_strategy` text DEFAULT 'squash' NOT NULL,
	`auto_advance` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`phase_entered_at` text NOT NULL,
	`loop_count` integer DEFAULT 0 NOT NULL,
	`assigned_agents_json` text DEFAULT '[]' NOT NULL,
	`blockers_json` text DEFAULT '[]' NOT NULL,
	`artifacts_json` text DEFAULT '[]' NOT NULL,
	`ports_json` text DEFAULT '[]' NOT NULL,
	`worktrees_json` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_phase` ON `tasks` (`phase`);--> statement-breakpoint
CREATE INDEX `idx_tasks_priority` ON `tasks` (`priority`);--> statement-breakpoint
CREATE INDEX `idx_tasks_story_id` ON `tasks` (`story_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_parent_task` ON `tasks` (`parent_task`);--> statement-breakpoint
CREATE TABLE `worktree_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` text NOT NULL,
	`agent_name` text NOT NULL,
	`worktree_path` text NOT NULL,
	`branch_name` text NOT NULL,
	`created_at` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_worktrees_task_id` ON `worktree_records` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_worktrees_status` ON `worktree_records` (`status`);