import { z } from 'zod';
import { randomUUID } from 'crypto';
import { getDb } from '../db/index';

export const TaskStatus = z.enum(['pending', 'running', 'complete', 'failed']);
export type TaskStatus = z.infer<typeof TaskStatus>;

export interface TaskResult {
  status: 'ok' | 'error';
  output: Record<string, unknown>;
  summary: string;
}

export interface Task {
  id: string;
  goal: string;
  status: TaskStatus;
  parent_task_id: string | null;
  spawn_count: number;
  step_count: number;
  result: TaskResult | null;
  created_at: number;
  updated_at: number;
}

interface TaskRow {
  id: string;
  goal: string;
  status: string;
  parent_task_id: string | null;
  spawn_count: number;
  step_count: number;
  result: string | null;
  created_at: number;
  updated_at: number;
}

function fromRow(row: TaskRow): Task {
  return {
    id: row.id,
    goal: row.goal,
    status: TaskStatus.parse(row.status),
    parent_task_id: row.parent_task_id,
    spawn_count: row.spawn_count,
    step_count: row.step_count,
    result: row.result ? JSON.parse(row.result) as TaskResult : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createTask(goal: string, parentTaskId?: string): Task {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO tasks (id, goal, status, parent_task_id, spawn_count, step_count, created_at, updated_at)
    VALUES (?, ?, 'pending', ?, 0, 0, ?, ?)
  `).run(id, goal, parentTaskId ?? null, now, now);

  return getTask(id)!;
}

export function getTask(id: string): Task | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
  return row ? fromRow(row) : null;
}

export function listTasks(status?: TaskStatus): Task[] {
  const db = getDb();
  if (status) {
    const rows = db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at ASC').all(status) as TaskRow[];
    return rows.map(fromRow);
  }
  const rows = db.prepare('SELECT * FROM tasks ORDER BY created_at ASC').all() as TaskRow[];
  return rows.map(fromRow);
}

export function updateTaskStatus(id: string, status: TaskStatus): void {
  const db = getDb();
  db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), id);
}

export function incrementSpawnCount(id: string): void {
  const db = getDb();
  db.prepare('UPDATE tasks SET spawn_count = spawn_count + 1, updated_at = ? WHERE id = ?').run(Date.now(), id);
}

export function incrementStepCount(id: string): void {
  const db = getDb();
  db.prepare('UPDATE tasks SET step_count = step_count + 1, updated_at = ? WHERE id = ?').run(Date.now(), id);
}

export function setTaskResult(id: string, result: TaskResult): void {
  const db = getDb();
  db.prepare('UPDATE tasks SET result = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(result), Date.now(), id);
}
