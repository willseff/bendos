import { randomUUID } from 'crypto';
import { getDb } from '../db/index';
import type { Visibility } from './memory';

export interface Artifact {
  id: string;
  task_id: string | null;
  name: string;
  content: string;
  mime_type: string;
  visibility: Visibility;
  created_at: number;
}

interface ArtifactRow {
  id: string;
  task_id: string | null;
  name: string;
  content: string;
  mime_type: string;
  visibility: Visibility;
  created_at: number;
}

function fromRow(row: ArtifactRow): Artifact {
  return {
    id: row.id,
    task_id: row.task_id,
    name: row.name,
    content: row.content,
    mime_type: row.mime_type,
    visibility: row.visibility,
    created_at: row.created_at,
  };
}

export function createArtifact(
  name: string,
  content: string,
  taskId?: string,
  mimeType?: string,
  visibility: Visibility = 'private'
): Artifact {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO artifacts (id, task_id, name, content, mime_type, visibility, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, taskId ?? null, name, content, mimeType ?? 'text/plain', visibility, now);

  return db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as Artifact;
}

// List artifacts visible to a task: its own + all public ones.
// When taskId is omitted (CLI/admin), returns everything.
export function listArtifacts(taskId?: string): Artifact[] {
  const db = getDb();
  if (taskId) {
    const rows = db.prepare(
      `SELECT * FROM artifacts
       WHERE task_id = ? OR visibility = 'public'
       ORDER BY created_at ASC`
    ).all(taskId) as ArtifactRow[];
    return rows.map(fromRow);
  }
  const rows = db.prepare('SELECT * FROM artifacts ORDER BY created_at ASC').all() as ArtifactRow[];
  return rows.map(fromRow);
}
