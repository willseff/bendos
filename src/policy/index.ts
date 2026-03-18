import type { Task } from '../objects/task';

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
}

export function checkPolicy(task: Task, toolName: string): PolicyResult {
  if (toolName === 'task.spawn' && task.spawn_count >= 3) {
    return {
      allowed: false,
      reason: `task.spawn may not be called more than 3 times per task (current spawn_count: ${task.spawn_count})`,
    };
  }

  if (task.capabilities !== null && !task.capabilities.includes(toolName)) {
    return {
      allowed: false,
      reason: `tool "${toolName}" is not in this task's capabilities allowlist`,
    };
  }

  return { allowed: true };
}
