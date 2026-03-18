import { getTask, listTasks } from '../objects/task';
import { listEvents } from '../objects/event';
import { receiveMessages } from '../objects/message';
import { queryMemories } from '../objects/memory';
import type { VFSMount, VFSEntry, VFSStat, VFSContext } from './index';

const PROC_FILES = ['status', 'events', 'inbox', 'memory'] as const;

export class ProcMount implements VFSMount {
  read(relPath: string, ctx: VFSContext): string | null {
    // /<taskId>/<file>
    const m = relPath.match(/^\/([^/]+)\/([^/]+)$/);
    if (!m) return null;
    const task = resolveTask(resolveSelf(m[1], ctx));
    if (!task) return null;
    return readProcFile(task.id, m[2]);
  }

  list(relPath: string, ctx: VFSContext): VFSEntry[] | null {
    // / → all tasks
    if (relPath === '/') {
      return listTasks().map(t => ({ name: t.id.slice(0, 8), type: 'dir' as const }));
    }
    // /<taskId> → proc files
    const m = relPath.match(/^\/([^/]+)$/);
    if (m) {
      const task = resolveTask(resolveSelf(m[1], ctx));
      if (!task) return null;
      return PROC_FILES.map(name => ({ name, type: 'file' as const }));
    }
    return null;
  }

  stat(relPath: string, ctx: VFSContext): VFSStat | null {
    // /
    if (relPath === '/') {
      return { type: 'dir', size: listTasks().length };
    }
    // /<taskId>
    const dirMatch = relPath.match(/^\/([^/]+)$/);
    if (dirMatch) {
      const task = resolveTask(resolveSelf(dirMatch[1], ctx));
      if (!task) return null;
      return { type: 'dir', size: PROC_FILES.length, updated_at: task.updated_at };
    }
    // /<taskId>/<file>
    const fileMatch = relPath.match(/^\/([^/]+)\/([^/]+)$/);
    if (fileMatch) {
      const task = resolveTask(resolveSelf(fileMatch[1], ctx));
      if (!task) return null;
      if (!(PROC_FILES as readonly string[]).includes(fileMatch[2])) return null;
      const content = readProcFile(task.id, fileMatch[2]);
      if (content === null) return null;
      return {
        type: 'file',
        size: Buffer.byteLength(content, 'utf8'),
        mimeType: 'application/json',
        updated_at: task.updated_at,
      };
    }
    return null;
  }
}

function readProcFile(taskId: string, file: string): string | null {
  const task = getTask(taskId);
  if (!task) return null;

  switch (file) {
    case 'status':
      return JSON.stringify({
        id:             task.id,
        goal:           task.goal,
        status:         task.status,
        step_count:     task.step_count,
        priority:       task.priority,
        agent_type:     task.agent_type,
        job_id:         task.job_id,
        waiting_for:    task.waiting_for,
        parent_task_id: task.parent_task_id,
        capabilities:   task.capabilities,
        result:         task.result,
        created_at:     task.created_at,
        updated_at:     task.updated_at,
      }, null, 2);

    case 'events':
      return JSON.stringify(listEvents(taskId, 20), null, 2);

    case 'inbox':
      // Peek without marking read — same rule as context assembler.
      return JSON.stringify(receiveMessages(taskId, false), null, 2);

    case 'memory':
      return JSON.stringify(queryMemories(taskId), null, 2);

    default:
      return null;
  }
}

// Accept full UUID or 8-char prefix (as shown in ps/top output).
function resolveTask(idOrPrefix: string) {
  const direct = getTask(idOrPrefix);
  if (direct) return direct;
  return listTasks().find(t => t.id.startsWith(idOrPrefix)) ?? null;
}

// Translate the special alias "self" to the calling task's ID.
function resolveSelf(segment: string, ctx: VFSContext): string {
  return segment === 'self' ? (ctx.taskId ?? segment) : segment;
}
