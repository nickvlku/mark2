ALTER TABLE `tasks` ADD `auto_approve` integer DEFAULT false NOT NULL;
ALTER TABLE `tasks` ADD `archived` integer DEFAULT false NOT NULL;
ALTER TABLE `tasks` ADD `archived_at` text;

CREATE INDEX `idx_tasks_archived` ON `tasks` (`archived`);