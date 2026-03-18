import { randomUUID } from 'crypto';
import { getDb } from '../db/index';

export interface Pipe {
  id: string;
  from_task_id: string;
  to_task_id: string;
  created_at: number;
}

export function createPipe(fromTaskId: string, toTaskId: string): Pipe {
  const db = getDb();
  const pipe: Pipe = {
    id: randomUUID(),
    from_task_id: fromTaskId,
    to_task_id: toTaskId,
    created_at: Date.now(),
  };
  db.prepare(
    'INSERT INTO pipes (id, from_task_id, to_task_id, created_at) VALUES (?, ?, ?, ?)'
  ).run(pipe.id, pipe.from_task_id, pipe.to_task_id, pipe.created_at);
  return pipe;
}

export function getPipesFrom(fromTaskId: string): Pipe[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM pipes WHERE from_task_id = ? ORDER BY created_at ASC'
  ).all(fromTaskId) as Pipe[];
}

export function listPipes(): Pipe[] {
  const db = getDb();
  return db.prepare('SELECT * FROM pipes ORDER BY created_at ASC').all() as Pipe[];
}
