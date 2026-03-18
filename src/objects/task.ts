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
  job_id: string | null;
  waiting_for: string | null;
  spawn_count: number;
  step_count: number;
  result: TaskResult | null;
  capabilities: string[] | null;
  agent_type: string | null;
  max_steps: number | null;
  priority: number;
  env: Record<string, string> | null;
  created_at: number;
  updated_at: number;
}

interface TaskRow {
  id: string;
  goal: string;
  status: string;
  parent_task_id: string | null;
  job_id: string | null;
  waiting_for: string | null;
  spawn_count: number;
  step_count: number;
  result: string | null;
  capabilities: string | null;
  agent_type: string | null;
  max_steps: number | null;
  priority: number;
  env: string | null;
  created_at: number;
  updated_at: number;
}

function fromRow(row: TaskRow): Task {
  return {
    id: row.id,
    goal: row.goal,
    status: TaskStatus.parse(row.status),
    parent_task_id: row.parent_task_id,
    job_id: row.job_id,
    waiting_for: row.waiting_for,
    spawn_count: row.spawn_count,
    step_count: row.step_count,
    result: row.result ? JSON.parse(row.result) as TaskResult : null,
    capabilities: row.capabilities ? JSON.parse(row.capabilities) as string[] : null,
    agent_type: row.agent_type,
    max_steps: row.max_steps,
    priority: row.priority ?? 0,
    env: row.env ? JSON.parse(row.env) as Record<string, string> : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface CreateTaskOptions {
  parentTaskId?: string;
  jobId?: string;
  capabilities?: string[];
  agentType?: string;
  maxSteps?: number;
  priority?: number;
  env?: Record<string, string>;
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
  const env  = opts.env !== undefined ? JSON.stringify(opts.env) : null;

  db.prepare(`
    INSERT INTO tasks (id, goal, status, parent_task_id, job_id, spawn_count, step_count, capabilities, agent_type, max_steps, priority, env, created_at, updated_at)
    VALUES (?, ?, 'pending', ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, goal, opts.parentTaskId ?? null, opts.jobId ?? null, caps, opts.agentType ?? null, opts.maxSteps ?? null, opts.priority ?? 0, env, now, now);

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

// On daemon startup, any task left in 'running' state is stale (the process
// that was executing it is gone). Reset them to 'pending' so they are retried.
export function recoverStaleTasks(): number {
  const db = getDb();
  const now = Date.now();
  const { changes } = db.prepare(
    `UPDATE tasks SET status = 'pending', updated_at = ? WHERE status = 'running'`
  ).run(now);
  return changes;
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

export function setWaitingFor(taskId: string, targetId: string): void {
  const db = getDb();
  db.prepare('UPDATE tasks SET waiting_for = ?, updated_at = ? WHERE id = ?').run(targetId, Date.now(), taskId);
}

export function clearWaiting(taskId: string): void {
  const db = getDb();
  db.prepare('UPDATE tasks SET waiting_for = NULL, updated_at = ? WHERE id = ?').run(Date.now(), taskId);
}

export function getWaiters(targetId: string): Task[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT * FROM tasks WHERE waiting_for = ? AND status = 'paused'`
  ).all(targetId) as TaskRow[];
  return rows.map(fromRow);
}

export function getTasksByJob(jobId: string): Task[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM tasks WHERE job_id = ? ORDER BY created_at ASC').all(jobId) as TaskRow[];
  return rows.map(fromRow);
}

export function listJobIds(): string[] {
  const db = getDb();
  const rows = db.prepare('SELECT DISTINCT job_id FROM tasks WHERE job_id IS NOT NULL ORDER BY job_id ASC').all() as { job_id: string }[];
  return rows.map(r => r.job_id);
}

// Cancel all non-terminal tasks in a job.
// Pending/paused → immediately failed. Running → cancel signal queued (runtime delivers it).
export function cancelJob(jobId: string): number {
  const db = getDb();
  const now = Date.now();
  const { changes } = db.prepare(
    `UPDATE tasks SET status = 'failed', updated_at = ?
     WHERE job_id = ? AND status IN ('pending', 'paused')`
  ).run(now, jobId);

  // Queue cancel signals for running tasks — runtime will deliver on next step.
  const running = db.prepare(
    `SELECT id FROM tasks WHERE job_id = ? AND status = 'running'`
  ).all(jobId) as { id: string }[];

  for (const { id } of running) {
    db.prepare(`
      INSERT INTO signals (id, task_id, type, payload, status, created_at)
      VALUES (?, ?, 'cancel', '{}', 'pending', ?)
    `).run(randomUUID(), id, now);
  }

  return changes + running.length;
}
