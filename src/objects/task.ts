import { z } from 'zod';
import { randomUUID } from 'crypto';
import { getDb } from '../db/index';

export const TaskStatus = z.enum(['pending', 'running', 'complete', 'failed', 'paused']);
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
  capabilities: string[] | null;
  agent_type: string | null;
  max_steps: number | null;
  priority: number;
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
  capabilities: string | null;
  agent_type: string | null;
  max_steps: number | null;
  priority: number;
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
    capabilities: row.capabilities ? JSON.parse(row.capabilities) as string[] : null,
    agent_type: row.agent_type,
    max_steps: row.max_steps,
    priority: row.priority ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface CreateTaskOptions {
  parentTaskId?: string;
  capabilities?: string[];
  agentType?: string;
  maxSteps?: number;
  priority?: number;
}

export function createTask(goal: string, parentTaskIdOrOpts?: string | CreateTaskOptions, capabilities?: string[]): Task {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  // Support both old signature createTask(goal, parentId?, caps?) and new options object.
  let opts: CreateTaskOptions = {};
  if (typeof parentTaskIdOrOpts === 'string') {
    opts = { parentTaskId: parentTaskIdOrOpts, capabilities };
  } else if (parentTaskIdOrOpts) {
    opts = parentTaskIdOrOpts;
  } else {
    opts = { capabilities };
  }

  const caps = opts.capabilities !== undefined ? JSON.stringify(opts.capabilities) : null;

  db.prepare(`
    INSERT INTO tasks (id, goal, status, parent_task_id, spawn_count, step_count, capabilities, agent_type, max_steps, priority, created_at, updated_at)
    VALUES (?, ?, 'pending', ?, 0, 0, ?, ?, ?, ?, ?, ?)
  `).run(id, goal, opts.parentTaskId ?? null, caps, opts.agentType ?? null, opts.maxSteps ?? null, opts.priority ?? 0, now, now);

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
