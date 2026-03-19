import { listTasks, getTask, updateTaskStatus } from '../objects/task';
import type { Task } from '../objects/task';
import { getPendingResumeSignals, markSignalDelivered } from '../objects/signal';
import { emitEvent } from '../objects/event';
import { getDb } from '../db/index';

// Called by the daemon before each poll. Flips paused tasks back to pending
// when a resume signal is waiting for them.
export function processResumeSignals(): void {
  const signals = getPendingResumeSignals();
  for (const signal of signals) {
    const task = getTask(signal.task_id);
    if (task?.status === 'paused') {
      updateTaskStatus(signal.task_id, 'pending');
      emitEvent('signal.delivered', { type: 'resume' }, signal.task_id);
    }
    markSignalDelivered(signal.id);
  }
}

export function getNextTask(): Task | null {
  const pendingTasks = listTasks('pending');
  if (pendingTasks.length === 0) return null;

  const runningTasks = listTasks('running');
  const runningIds = new Set(runningTasks.map(t => t.id));

  // Sort by: priority DESC → depth-first (children of running tasks) → FIFO
  const sorted = [...pendingTasks].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const aIsChild = a.parent_task_id !== null && runningIds.has(a.parent_task_id);
    const bIsChild = b.parent_task_id !== null && runningIds.has(b.parent_task_id);
    if (aIsChild !== bIsChild) return aIsChild ? -1 : 1;
    return a.created_at - b.created_at;
  });

  return sorted[0];
}

// Atomically select and mark the next task as running.
// Uses a SQLite transaction so concurrent callers can't claim the same task.
export function claimNextTask(): Task | null {
  const db = getDb();
  let claimed: Task | null = null;
  db.transaction(() => {
    const task = getNextTask();
    if (!task) return;
    updateTaskStatus(task.id, 'running');
    claimed = { ...task, status: 'running' };
  })();
  return claimed;
}
