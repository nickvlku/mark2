import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

let db: ReturnType<typeof drizzle> | null = null;
let sqliteDb: Database.Database | null = null;
let initialized = false;

export function getDb(mark2Dir?: string): ReturnType<typeof drizzle> {
  if (db) return db;

  const dbPath = mark2Dir
    ? path.join(mark2Dir, 'mark2.db')
    : path.join(process.cwd(), '.mark2', 'mark2.db');

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
  const database = getDb(mark2Dir);
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
      assigned_agents_json TEXT NOT NULL DEFAULT '[]',
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

  // Initialize counters if not present
  const stmt = sqliteInstance.prepare('INSERT OR IGNORE INTO id_counters (entity_type, next_id) VALUES (?, ?)');
  stmt.run('task', 1);
  stmt.run('story', 1);
}

export { schema };
export type DrizzleDB = ReturnType<typeof drizzle>;
