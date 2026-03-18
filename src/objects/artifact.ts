import { randomUUID } from 'crypto';
import { getDb } from '../db/index';
import type { Visibility } from './memory';

export interface Artifact {
  id: string;
  task_id: string | null;
  name: string;
  path: string | null;
  content: string;
  mime_type: string;
  visibility: Visibility;
  created_at: number;
}

interface ArtifactRow {
  id: string;
  task_id: string | null;
  name: string;
  path: string | null;
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
    path: row.path,
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
  visibility: Visibility = 'private',
  path?: string,
): Artifact {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO artifacts (id, task_id, name, path, content, mime_type, visibility, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, taskId ?? null, name, path ?? null, content, mimeType ?? 'text/plain', visibility, now);

  return db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as Artifact;
}

// Read a single artifact by path, respecting visibility for the given task.
export function getArtifactByPath(path: string, taskId?: string): Artifact | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM artifacts WHERE path = ? ORDER BY created_at DESC LIMIT 1').get(path) as ArtifactRow | undefined;
  if (!row) return null;
  if (taskId && row.visibility === 'private' && row.task_id !== taskId) return null;
  return fromRow(row);
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

// List artifacts whose path starts with a given prefix (directory listing).
// Respects visibility the same way as listArtifacts.
export function listArtifactsByPath(prefix: string, taskId?: string): Artifact[] {
  const db = getDb();
  const like = prefix.endsWith('/') ? `${prefix}%` : `${prefix}/%`;
  if (taskId) {
    const rows = db.prepare(
      `SELECT * FROM artifacts
       WHERE (path LIKE ? OR path = ?) AND (task_id = ? OR visibility = 'public')
       ORDER BY path ASC`
    ).all(like, prefix, taskId) as ArtifactRow[];
    return rows.map(fromRow);
  }
  const rows = db.prepare(
    `SELECT * FROM artifacts WHERE path LIKE ? OR path = ? ORDER BY path ASC`
  ).all(like, prefix) as ArtifactRow[];
  return rows.map(fromRow);
}
