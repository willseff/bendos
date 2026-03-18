import { randomUUID } from 'crypto';
import { getDb } from '../db/index';

export interface Memory {
  id: string;
  task_id: string | null;
  content: string;
  tags: string[];
  created_at: number;
}

interface MemoryRow {
  id: string;
  task_id: string | null;
  content: string;
  tags: string;
  created_at: number;
}

function fromRow(row: MemoryRow): Memory {
  return {
    id: row.id,
    task_id: row.task_id,
    content: row.content,
    tags: JSON.parse(row.tags) as string[],
    created_at: row.created_at,
  };
}

export function writeMemory(content: string, taskId?: string, tags?: string[]): Memory {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO memories (id, task_id, content, tags, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, taskId ?? null, content, JSON.stringify(tags ?? []), now);

  return readMemory(id)!;
}

export function readMemory(id: string): Memory | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as MemoryRow | undefined;
  return row ? fromRow(row) : null;
}

export function queryMemories(taskId?: string, tag?: string): Memory[] {
  const db = getDb();

  if (taskId && tag) {
    const rows = db.prepare(
      "SELECT * FROM memories WHERE task_id = ? AND tags LIKE ? ORDER BY created_at ASC"
    ).all(taskId, `%"${tag}"%`) as MemoryRow[];
    return rows.map(fromRow);
  }

  if (taskId) {
    const rows = db.prepare(
      'SELECT * FROM memories WHERE task_id = ? ORDER BY created_at ASC'
    ).all(taskId) as MemoryRow[];
    return rows.map(fromRow);
  }

  if (tag) {
    const rows = db.prepare(
      "SELECT * FROM memories WHERE tags LIKE ? ORDER BY created_at ASC"
    ).all(`%"${tag}"%`) as MemoryRow[];
    return rows.map(fromRow);
  }

  const rows = db.prepare('SELECT * FROM memories ORDER BY created_at ASC').all() as MemoryRow[];
  return rows.map(fromRow);
}
