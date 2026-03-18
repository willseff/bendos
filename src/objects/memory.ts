import { randomUUID } from 'crypto';
import { getDb } from '../db/index';

export type Visibility = 'private' | 'public';

export interface Memory {
  id: string;
  task_id: string | null;
  content: string;
  tags: string[];
  visibility: Visibility;
  created_at: number;
}

interface MemoryRow {
  id: string;
  task_id: string | null;
  content: string;
  tags: string;
  visibility: Visibility;
  created_at: number;
}

function fromRow(row: MemoryRow): Memory {
  return {
    id: row.id,
    task_id: row.task_id,
    content: row.content,
    tags: JSON.parse(row.tags) as string[],
    visibility: row.visibility,
    created_at: row.created_at,
  };
}

export function writeMemory(
  content: string,
  taskId?: string,
  tags?: string[],
  visibility: Visibility = 'private'
): Memory {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO memories (id, task_id, content, tags, visibility, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, taskId ?? null, content, JSON.stringify(tags ?? []), visibility, now);

  return readMemory(id)!;
}

// Read a memory by ID. Enforces visibility: private memories belonging to another
// task are not accessible. Pass forTaskId = undefined to bypass (admin/CLI use).
export function readMemory(id: string, forTaskId?: string): Memory | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as MemoryRow | undefined;
  if (!row) return null;
  const memory = fromRow(row);
  if (forTaskId !== undefined && memory.visibility === 'private' && memory.task_id !== forTaskId) {
    return null;
  }
  return memory;
}

// Query memories visible to a task: its own memories + all public memories.
// When taskId is omitted (CLI/admin), returns everything.
export function queryMemories(taskId?: string, tag?: string): Memory[] {
  const db = getDb();

  const tagFilter = tag ? `AND tags LIKE ?` : '';
  const tagArg = tag ? [`%"${tag}"%`] : [];

  if (taskId) {
    const rows = db.prepare(
      `SELECT * FROM memories
       WHERE (task_id = ? OR visibility = 'public') ${tagFilter}
       ORDER BY created_at ASC`
    ).all(taskId, ...tagArg) as MemoryRow[];
    return rows.map(fromRow);
  }

  const rows = db.prepare(
    `SELECT * FROM memories WHERE 1=1 ${tagFilter} ORDER BY created_at ASC`
  ).all(...tagArg) as MemoryRow[];
  return rows.map(fromRow);
}
