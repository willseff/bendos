import { listTasks, getTask, updateTaskStatus } from '../objects/task';
import type { Task } from '../objects/task';
import { getPendingResumeSignals, markSignalDelivered } from '../objects/signal';
import { emitEvent } from '../objects/event';

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

  // Depth-first: prefer pending children of running tasks
  for (const task of pendingTasks) {
    if (task.parent_task_id && runningIds.has(task.parent_task_id)) {
      return task;
    }
  }

  // FIFO: return first pending task by created_at
  return pendingTasks[0];
}
