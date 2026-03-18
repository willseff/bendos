import type Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      goal TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      parent_task_id TEXT REFERENCES tasks(id),
      spawn_count INTEGER NOT NULL DEFAULT 0,
      step_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      task_id TEXT REFERENCES tasks(id),
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tools (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      input_schema TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      task_id TEXT REFERENCES tasks(id),
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'text/plain',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      from_task_id TEXT NOT NULL,
      to_task_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unread',
      created_at INTEGER NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pipes (
      id TEXT PRIMARY KEY,
      from_task_id TEXT NOT NULL,
      to_task_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  // Incremental columns — safe to re-run on existing databases.
  for (const sql of [
    `ALTER TABLE memories  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'`,
    `ALTER TABLE artifacts ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'`,
    `ALTER TABLE tasks     ADD COLUMN result TEXT`,
    `ALTER TABLE tasks     ADD COLUMN capabilities TEXT`,
    `ALTER TABLE artifacts ADD COLUMN path TEXT`,
  ]) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }
}
