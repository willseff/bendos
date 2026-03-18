import { listTasks } from '../objects/task';
import type { Task } from '../objects/task';

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
