import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { getMark2Dir } from '../utils/mark2-dir';
import path from 'path';
import fs from 'fs';

let db: ReturnType<typeof drizzle> | null = null;
let sqliteDb: Database.Database | null = null;
let initialized = false;

export function getDb(mark2Dir?: string): ReturnType<typeof drizzle> {
  if (db) return db;

  const resolvedMark2Dir = mark2Dir ?? getMark2Dir();
  const dbPath = path.join(resolvedMark2Dir, 'mark2.db');

  // Ensure directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  sqliteDb = new Database(dbPath);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');

  db = drizzle(sqliteDb, { schema });

  // Auto-initialize tables on first connection
  if (!initialized) {
    initializeDatabase(mark2Dir);
  }

  return db;
}

export function closeDb(): void {
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
    db = null;
    initialized = false;
  }
}

export function initializeDatabase(mark2Dir?: string): void {
  if (initialized) return;
  const resolvedMark2Dir = mark2Dir ?? getMark2Dir();
  const database = getDb(resolvedMark2Dir);
  initialized = true;
  // Create all tables using raw SQL from the schema
  // We'll use drizzle-kit push for migrations, but also support programmatic creation
  const sqliteInstance = sqliteDb!;

  // Create tables if they don't exist
  sqliteInstance.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      phase TEXT NOT NULL DEFAULT 'pending',
      priority TEXT NOT NULL DEFAULT 'P2',
      story_id TEXT,
      parent_task TEXT,
      created_by TEXT NOT NULL,
      merge_strategy TEXT NOT NULL DEFAULT 'squash',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      phase_entered_at TEXT NOT NULL,
      loop_count INTEGER NOT NULL DEFAULT 0,
      phase_agents_json TEXT NOT NULL DEFAULT '{}',
      phase_overrides_json TEXT NOT NULL DEFAULT '{}',
      blockers_json TEXT NOT NULL DEFAULT '[]',
      artifacts_json TEXT NOT NULL DEFAULT '[]',
      ports_json TEXT NOT NULL DEFAULT '[]',
      worktrees_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_phase ON tasks(phase);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
    CREATE INDEX IF NOT EXISTS idx_tasks_story_id ON tasks(story_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_parent_task ON tasks(parent_task);

    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      tasks_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS activity_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      source TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_activity_task_id ON activity_entries(task_id);
    CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_entries(timestamp);

    CREATE TABLE IF NOT EXISTS port_allocations (
      task_id TEXT PRIMARY KEY,
      ports_json TEXT NOT NULL,
      services_json TEXT NOT NULL DEFAULT '{}',
      allocated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS worktree_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      worktree_path TEXT NOT NULL,
      branch_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE INDEX IF NOT EXISTS idx_worktrees_task_id ON worktree_records(task_id);
    CREATE INDEX IF NOT EXISTS idx_worktrees_status ON worktree_records(status);

    CREATE TABLE IF NOT EXISTS agent_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      phase TEXT NOT NULL,
      tmux_session TEXT NOT NULL,
      pid INTEGER,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      exit_code INTEGER,
      status TEXT NOT NULL DEFAULT 'running'
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_task_id ON agent_sessions(task_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON agent_sessions(status);

    CREATE TABLE IF NOT EXISTS id_counters (
      entity_type TEXT PRIMARY KEY,
      next_id INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS corrupt_files (
      file_path TEXT PRIMARY KEY,
      error_message TEXT NOT NULL,
      detected_at TEXT NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Migrations: add columns that may not exist yet
  try {
    sqliteInstance.exec(`ALTER TABLE tasks ADD COLUMN auto_approve INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // Column already exists
  }

  try {
    sqliteInstance.exec(`ALTER TABLE tasks ADD COLUMN auto_advance INTEGER NOT NULL DEFAULT 1`);
  } catch {
    // Column already exists
  }

  // Migrate assigned_agents_json to phase_agents_json if needed
  try {
    // Check if old column exists
    const columns = sqliteInstance.pragma('table_info(tasks)') as { name: string }[];
    const hasOldColumn = columns.some(c => c.name === 'assigned_agents_json');
    const hasNewColumn = columns.some(c => c.name === 'phase_agents_json');
    
    if (hasOldColumn && !hasNewColumn) {
      sqliteInstance.exec(`ALTER TABLE tasks ADD COLUMN phase_agents_json TEXT NOT NULL DEFAULT '{}'`);
      // Note: Old data is lost, but it was just an array of names anyway
    }
  } catch {
    // Migration already done or not needed
  }

  // Add phase_overrides_json column for new role/cli/model decoupling
  try {
    sqliteInstance.exec(`ALTER TABLE tasks ADD COLUMN phase_overrides_json TEXT NOT NULL DEFAULT '{}'`);
  } catch {
    // Column already exists
  }

  // Add archived columns for task archiving feature
  try {
    sqliteInstance.exec(`ALTER TABLE tasks ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // Column already exists
  }

  try {
    sqliteInstance.exec(`ALTER TABLE tasks ADD COLUMN archived_at TEXT`);
  } catch {
    // Column already exists
  }

  // Add index for archived column
  try {
    sqliteInstance.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(archived)`);
  } catch {
    // Index already exists
  }

  // Initialize counters if not present
  const stmt = sqliteInstance.prepare('INSERT OR IGNORE INTO id_counters (entity_type, next_id) VALUES (?, ?)');
  stmt.run('task', 1);
  stmt.run('story', 1);

  // Recalculate counters from state files to prevent ID collisions
  // This handles the case where the database is recreated but state files exist
  recalculateIdCountersFromState(resolvedMark2Dir, sqliteInstance);
}

/**
 * Recalculate ID counters from existing state files and storage directories.
 * This prevents ID collisions when the database is recreated
 * but task/story files already exist in the state directory or storage.
 */
function recalculateIdCountersFromState(mark2Dir: string, sqliteInstance: Database.Database): void {
  const stateDir = path.join(mark2Dir, '.state');
  const tasksDir = path.join(stateDir, 'tasks');
  const storiesDir = path.join(stateDir, 'stories');
  const storageDir = path.join(mark2Dir, 'storage');

  // Find max task ID from state files
  let maxTaskId = 0;
  if (fs.existsSync(tasksDir)) {
    const taskFiles = fs.readdirSync(tasksDir).filter(f => f.match(/^TASK-\d+\.yaml$/));
    for (const file of taskFiles) {
      const match = file.match(/^TASK-(\d+)\.yaml$/);
      if (match) {
        const id = parseInt(match[1], 10);
        if (id > maxTaskId) maxTaskId = id;
      }
    }
  }

  // Also check storage directory for existing task data
  if (fs.existsSync(storageDir)) {
    const storageDirs = fs.readdirSync(storageDir).filter(f => f.match(/^TASK-\d+$/));
    for (const dir of storageDirs) {
      const match = dir.match(/^TASK-(\d+)$/);
      if (match) {
        const id = parseInt(match[1], 10);
        if (id > maxTaskId) maxTaskId = id;
      }
    }
  }

  // Find max story ID from state files
  let maxStoryId = 0;
  if (fs.existsSync(storiesDir)) {
    const storyFiles = fs.readdirSync(storiesDir).filter(f => f.match(/^STORY-\d+\.yaml$/));
    for (const file of storyFiles) {
      const match = file.match(/^STORY-(\d+)\.yaml$/);
      if (match) {
        const id = parseInt(match[1], 10);
        if (id > maxStoryId) maxStoryId = id;
      }
    }
  }

  // Update counters if we found higher IDs than what's currently set
  if (maxTaskId > 0) {
    const currentTaskCounter = sqliteInstance.prepare(
      'SELECT next_id FROM id_counters WHERE entity_type = ?'
    ).get('task') as { next_id: number } | undefined;

    if (!currentTaskCounter || currentTaskCounter.next_id <= maxTaskId) {
      sqliteInstance.prepare(
        'UPDATE id_counters SET next_id = ? WHERE entity_type = ?'
      ).run(maxTaskId + 1, 'task');
    }
  }

  if (maxStoryId > 0) {
    const currentStoryCounter = sqliteInstance.prepare(
      'SELECT next_id FROM id_counters WHERE entity_type = ?'
    ).get('story') as { next_id: number } | undefined;

    if (!currentStoryCounter || currentStoryCounter.next_id <= maxStoryId) {
      sqliteInstance.prepare(
        'UPDATE id_counters SET next_id = ? WHERE entity_type = ?'
      ).run(maxStoryId + 1, 'story');
    }
  }
}

export { schema };
export type DrizzleDB = ReturnType<typeof drizzle>;
