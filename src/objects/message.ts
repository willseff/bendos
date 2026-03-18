import { z } from 'zod';
import { getDb } from '../db/index';

export const MessageSchema = z.object({
  id: z.string(),
  from_task_id: z.string(),
  to_task_id: z.string(),
  type: z.string(),
  payload: z.record(z.unknown()),
  status: z.enum(['unread', 'read']),
  created_at: z.number(),
});

export type Message = z.infer<typeof MessageSchema>;

type MessageRow = Omit<Message, 'payload'> & { payload: string };

function fromRow(row: MessageRow): Message {
  return { ...row, payload: JSON.parse(row.payload) };
}

export function sendMessage(
  fromTaskId: string,
  toTaskId: string,
  type: string,
  payload: Record<string, unknown> = {}
): Message {
  const db = getDb();
  const message: Message = {
    id: crypto.randomUUID(),
    from_task_id: fromTaskId,
    to_task_id: toTaskId,
    type,
    payload,
    status: 'unread',
    created_at: Date.now(),
  };
  db.prepare(`
    INSERT INTO messages (id, from_task_id, to_task_id, type, payload, status, created_at)
    VALUES (@id, @from_task_id, @to_task_id, @type, @payload, @status, @created_at)
  `).run({ ...message, payload: JSON.stringify(message.payload) });
  return message;
}

// Returns unread messages for a task. Marks them read by default.
export function receiveMessages(toTaskId: string, markRead = true): Message[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM messages WHERE to_task_id = ? AND status = 'unread' ORDER BY created_at ASC"
  ).all(toTaskId) as MessageRow[];

  if (markRead && rows.length > 0) {
    db.prepare(
      "UPDATE messages SET status = 'read' WHERE to_task_id = ? AND status = 'unread'"
    ).run(toTaskId);
  }

  return rows.map(fromRow);
}

export function countUnread(toTaskId: string): number {
  const db = getDb();
  const row = db.prepare(
    "SELECT COUNT(*) as n FROM messages WHERE to_task_id = ? AND status = 'unread'"
  ).get(toTaskId) as { n: number };
  return row.n;
}

// All messages sent to or from a task, for display purposes.
export function listMessages(taskId: string): Message[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM messages WHERE to_task_id = ? OR from_task_id = ? ORDER BY created_at ASC'
  ).all(taskId, taskId) as MessageRow[];
  return rows.map(fromRow);
}
