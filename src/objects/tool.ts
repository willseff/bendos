import { randomUUID } from 'crypto';
import { getDb } from '../db/index';

export interface Tool {
  id: string;
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  created_at: number;
}

interface ToolRow {
  id: string;
  name: string;
  description: string;
  input_schema: string;
  created_at: number;
}

function fromRow(row: ToolRow): Tool {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    input_schema: JSON.parse(row.input_schema) as Record<string, unknown>,
    created_at: row.created_at,
  };
}

export function registerToolRecord(
  name: string,
  description: string,
  inputSchema: Record<string, unknown>
): void {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM tools WHERE name = ?').get(name);
  if (existing) return;

  const id = randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO tools (id, name, description, input_schema, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name, description, JSON.stringify(inputSchema), now);
}

export function listToolRecords(): Tool[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM tools ORDER BY created_at ASC').all() as ToolRow[];
  return rows.map(fromRow);
}
