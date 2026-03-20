ALTER TABLE `stories` ADD `archived` integer DEFAULT false NOT NULL;
ALTER TABLE `stories` ADD `archived_at` text;

CREATE INDEX `idx_stories_archived` ON `stories` (`archived`);
