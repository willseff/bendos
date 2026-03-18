import { randomUUID } from 'crypto';
import { getDb } from '../db/index';

export interface Event {
  id: string;
  task_id: string | null;
  type: string;
  payload: Record<string, unknown>;
  created_at: number;
}

interface EventRow {
  id: string;
  task_id: string | null;
  type: string;
  payload: string;
  created_at: number;
}

function fromRow(row: EventRow): Event {
  return {
    id: row.id,
    task_id: row.task_id,
    type: row.type,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    created_at: row.created_at,
  };
}

export function emitEvent(
  type: string,
  payload: Record<string, unknown>,
  taskId?: string
): Event {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO events (id, task_id, type, payload, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, taskId ?? null, type, JSON.stringify(payload), now);

  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow;
  return fromRow(row);
}

export function listEvents(taskId?: string, limit?: number): Event[] {
  const db = getDb();
  const cap = limit ?? 100;

  if (taskId) {
    const rows = db.prepare(
      'SELECT * FROM events WHERE task_id = ? ORDER BY created_at ASC LIMIT ?'
    ).all(taskId, cap) as EventRow[];
    return rows.map(fromRow);
  }

  const rows = db.prepare(
    'SELECT * FROM events ORDER BY created_at DESC LIMIT ?'
  ).all(cap) as EventRow[];
  return rows.map(fromRow);
}
