import { getDb } from '../db/index';
import { listTasks } from '../objects/task';
import type { Task } from '../objects/task';
import { listEvents } from '../objects/event';
import { listToolRecords } from '../objects/tool';

function age(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function trunc(str: string, len: number): string {
  return str.length > len ? str.slice(0, len - 3) + '...' : str;
}

const STATUS_SYMBOL: Record<string, string> = {
  pending:  '○',
  running:  '●',
  complete: '✓',
  failed:   '✗',
  paused:   '‖',
};

// ─── ps ──────────────────────────────────────────────────────────────────────

export function printPs(): void {
  const tasks = listTasks();
  if (tasks.length === 0) { console.log('No tasks.'); return; }

  // Build parent → children map
  const children = new Map<string | null, Task[]>();
  for (const t of tasks) {
    const pid = t.parent_task_id ?? null;
    if (!children.has(pid)) children.set(pid, []);
    children.get(pid)!.push(t);
  }

  const W = { pid: 10, status: 10, steps: 6, age: 6 };
  const goalW = 78 - W.pid - W.status - W.steps - W.age;

  console.log(
    `${'PID'.padEnd(W.pid)}${'STATUS'.padEnd(W.status)}${'STEPS'.padEnd(W.steps)}${'AGE'.padEnd(W.age)}  GOAL`
  );
  console.log('─'.repeat(78));

  function printTask(t: Task, depth: number): void {
    const sym   = STATUS_SYMBOL[t.status] ?? '?';
    const indent = depth > 0 ? '  '.repeat(depth) + '↳ ' : '';
    const goal  = trunc(t.goal, goalW - indent.length);
    console.log(
      `${t.id.slice(0, 8).padEnd(W.pid)}` +
      `${(sym + ' ' + t.status).padEnd(W.status)}` +
      `${String(t.step_count).padEnd(W.steps)}` +
      `${age(t.created_at).padEnd(W.age)}` +
      `  ${indent}${goal}`
    );
    const kids = (children.get(t.id) ?? []).sort((a, b) => a.created_at - b.created_at);
    for (const child of kids) printTask(child, depth + 1);
  }

  const roots = (children.get(null) ?? []).sort((a, b) => a.created_at - b.created_at);
  for (const r of roots) printTask(r, 0);
}

// ─── top ─────────────────────────────────────────────────────────────────────

function section(label: string): void {
  console.log(`\n${label} ${'─'.repeat(Math.max(0, 72 - label.length))}`);
}

export function printTop(): void {
  const tasks    = listTasks();
  const tools    = listToolRecords();
  const recent   = listEvents(undefined, 10);
  const db       = getDb();
  const { n: eventTotal } = db.prepare('SELECT COUNT(*) as n FROM events').get() as { n: number };

  const byStatus = (s: string) => tasks.filter(t => t.status === s);
  const running  = byStatus('running');
  const pending  = byStatus('pending').slice(0, 5);
  const paused   = byStatus('paused');

  // Header
  console.log(`bendos top  —  ${new Date().toISOString()}`);
  console.log();
  console.log(
    `  tasks    ${tasks.length}   ` +
    `● ${byStatus('running').length} running   ` +
    `○ ${byStatus('pending').length} pending   ` +
    `✓ ${byStatus('complete').length} complete   ` +
    `✗ ${byStatus('failed').length} failed   ` +
    `‖ ${byStatus('paused').length} paused`
  );
  console.log(`  tools    ${tools.length}   events   ${eventTotal}`);

  // Running
  section('RUNNING');
  if (running.length === 0) {
    console.log('  (none)');
  } else {
    for (const t of running) {
      console.log(`  ${t.id.slice(0, 8)}  ${t.step_count} steps  ${age(t.created_at)} ago  "${trunc(t.goal, 52)}"`);
    }
  }

  // Paused
  if (paused.length > 0) {
    section('PAUSED');
    for (const t of paused) {
      console.log(`  ${t.id.slice(0, 8)}  ${t.step_count} steps  paused ${age(t.updated_at)} ago  "${trunc(t.goal, 46)}"`);
    }
  }

  // Pending
  section('PENDING');
  if (pending.length === 0) {
    console.log('  (none)');
  } else {
    for (const t of pending) {
      console.log(`  ${t.id.slice(0, 8)}  queued ${age(t.created_at)} ago  "${trunc(t.goal, 54)}"`);
    }
  }

  // Recent events
  section('RECENT EVENTS');
  if (recent.length === 0) {
    console.log('  (none)');
  } else {
    for (const e of [...recent].reverse()) {
      const ts      = new Date(e.created_at).toISOString().slice(11, 19);
      const taskRef = e.task_id ? ` ${e.task_id.slice(0, 8)}` : '         ';
      let detail = '';
      if (e.type === 'action.executed') {
        const p = e.payload as { step?: number; tool?: string };
        detail = `  step ${p.step}: ${p.tool}`;
      } else if (e.type === 'task.spawned') {
        const p = e.payload as { childTaskId?: string };
        detail = `  → ${p.childTaskId?.slice(0, 8)}`;
      } else if (e.type === 'signal.delivered') {
        const p = e.payload as { type?: string };
        detail = `  ${p.type}`;
      }
      console.log(`  ${ts}  ${e.type.padEnd(22)}${taskRef}${detail}`);
    }
  }
  console.log();
}
