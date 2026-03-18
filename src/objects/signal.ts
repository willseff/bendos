import { randomUUID } from 'crypto';
import { getDb } from '../db/index';

export type SignalType = 'cancel' | 'pause' | 'resume' | 'inject';

export interface Signal {
  id: string;
  task_id: string;
  type: SignalType;
  payload: Record<string, unknown>;
  status: 'pending' | 'delivered';
  created_at: number;
}

type SignalRow = Omit<Signal, 'payload'> & { payload: string };

function fromRow(row: SignalRow): Signal {
  return { ...row, payload: JSON.parse(row.payload) };
}

export function sendSignal(
  taskId: string,
  type: SignalType,
  payload: Record<string, unknown> = {}
): Signal {
  const db = getDb();
  const signal: Signal = {
    id: randomUUID(),
    task_id: taskId,
    type,
    payload,
    status: 'pending',
    created_at: Date.now(),
  };
  db.prepare(`
    INSERT INTO signals (id, task_id, type, payload, status, created_at)
    VALUES (@id, @task_id, @type, @payload, @status, @created_at)
  `).run({ ...signal, payload: JSON.stringify(signal.payload) });
  return signal;
}

// Returns the oldest pending signal for a task. Called by the runtime between steps.
export function getPendingSignal(taskId: string): Signal | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM signals WHERE task_id = ? AND status = 'pending' ORDER BY created_at ASC LIMIT 1"
  ).get(taskId) as SignalRow | undefined;
  return row ? fromRow(row) : null;
}

// Returns all pending resume signals across all tasks. Called by the daemon loop.
export function getPendingResumeSignals(): Signal[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM signals WHERE type = 'resume' AND status = 'pending' ORDER BY created_at ASC"
  ).all() as SignalRow[];
  return rows.map(fromRow);
}

export function markSignalDelivered(signalId: string): void {
  const db = getDb();
  db.prepare("UPDATE signals SET status = 'delivered' WHERE id = ?").run(signalId);
}

export function listSignals(taskId: string): Signal[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM signals WHERE task_id = ? ORDER BY created_at ASC'
  ).all(taskId) as SignalRow[];
  return rows.map(fromRow);
}
