import type { LLMAdapter } from '../llm/index';
import { validateAction } from '../llm/index';
import { getNextTask, } from './scheduler';
import { getTask, updateTaskStatus, incrementStepCount, setTaskResult } from '../objects/task';
import type { TaskResult } from '../objects/task';
import { emitEvent } from '../objects/event';
import { assembleContext } from '../context/assembler';
import { checkPolicy } from '../policy/index';
import { getTool } from '../tools/registry';
import { getPipesFrom } from '../objects/pipe';
import { sendMessage } from '../objects/message';
import { getPendingSignal, markSignalDelivered } from '../objects/signal';
import { getWaiters, clearWaiting } from '../objects/task';

const DEFAULT_MAX_STEPS = 20;

// Resume any tasks that called task.wait on taskId, delivering the final result.
function resumeWaiters(taskId: string, finalStatus: string, result: TaskResult | null): void {
  const waiters = getWaiters(taskId);
  const task = getTask(taskId)!;
  for (const waiter of waiters) {
    sendMessage(taskId, waiter.id, 'task.result', {
      from_task: taskId,
      goal: task.goal,
      status: finalStatus,
      result,
    });
    clearWaiting(waiter.id);
    updateTaskStatus(waiter.id, 'pending');
    emitEvent('task.resumed', { waitedFor: taskId, finalStatus }, waiter.id);
  }
}

export async function runOnce(
  adapter: LLMAdapter
): Promise<{ ran: boolean; taskId?: string }> {
  const task = getNextTask();
  if (!task) return { ran: false };

  updateTaskStatus(task.id, 'running');
  emitEvent('task.started', { goal: task.goal }, task.id);

  const maxSteps = task.max_steps ?? DEFAULT_MAX_STEPS;
  const scratchpad: string[] = [];

  for (let step = 0; step < maxSteps; step++) {
    // Re-fetch task to get latest spawn_count, step_count, etc.
    const currentTask = getTask(task.id)!;

    // Check for pending signals before each step — the runtime handles them,
    // not the agent. Like a kernel intercepting signals between instructions.
    const signal = getPendingSignal(task.id);
    if (signal) {
      markSignalDelivered(signal.id);
      emitEvent('signal.delivered', { type: signal.type, payload: signal.payload }, task.id);

      if (signal.type === 'cancel') {
        resumeWaiters(task.id, 'failed', null);
        updateTaskStatus(task.id, 'failed');
        return { ran: true, taskId: task.id };
      }

      if (signal.type === 'pause') {
        updateTaskStatus(task.id, 'paused');
        return { ran: true, taskId: task.id };
      }

      if (signal.type === 'inject') {
        // Push payload into the task's inbox — it will appear in context this step.
        sendMessage('system', task.id, 'signal.inject', signal.payload);
      }
      // 'resume' is handled by the daemon, not here.
    }

    const context = assembleContext(currentTask, scratchpad);

    // Call LLM adapter
    let rawAction: unknown;
    try {
      rawAction = await adapter.complete(context);
    } catch (err) {
      emitEvent('action.invalid', { error: String(err), step }, task.id);
      resumeWaiters(task.id, 'failed', null);
      updateTaskStatus(task.id, 'failed');
      return { ran: true, taskId: task.id };
    }

    // Validate action schema
    const action = validateAction(rawAction);
    if (!action) {
      emitEvent('action.invalid', { raw: rawAction, step }, task.id);
      resumeWaiters(task.id, 'failed', null);
      updateTaskStatus(task.id, 'failed');
      return { ran: true, taskId: task.id };
    }

    // Check policy
    const policy = checkPolicy(currentTask, action.tool);
    if (!policy.allowed) {
      emitEvent('policy.denied', { tool: action.tool, reason: policy.reason, step }, task.id);
      resumeWaiters(task.id, 'failed', null);
      updateTaskStatus(task.id, 'failed');
      return { ran: true, taskId: task.id };
    }

    // Get tool
    const toolDef = getTool(action.tool);
    if (!toolDef) {
      emitEvent('action.invalid', { error: `Unknown tool: ${action.tool}`, step }, task.id);
      resumeWaiters(task.id, 'failed', null);
      updateTaskStatus(task.id, 'failed');
      return { ran: true, taskId: task.id };
    }

    // Validate tool input
    const inputResult = toolDef.inputSchema.safeParse(action.input);
    if (!inputResult.success) {
      emitEvent('tool.error', { tool: action.tool, error: inputResult.error.message, step }, task.id);
      resumeWaiters(task.id, 'failed', null);
      updateTaskStatus(task.id, 'failed');
      return { ran: true, taskId: task.id };
    }

    // Execute tool
    let result: unknown;
    try {
      result = await toolDef.execute(inputResult.data, {
        taskId: task.id,
        task: currentTask,
      });
    } catch (err) {
      emitEvent('tool.error', { tool: action.tool, error: String(err), step }, task.id);
      resumeWaiters(task.id, 'failed', null);
      updateTaskStatus(task.id, 'failed');
      return { ran: true, taskId: task.id };
    }

    // Increment step count
    incrementStepCount(task.id);

    // Emit action.executed
    emitEvent(
      'action.executed',
      { step, thought: action.thought, tool: action.tool, input: action.input, result, scratchpad: action.scratchpad },
      task.id
    );

    // Accumulate scratchpad entry for next iteration
    if (action.scratchpad) scratchpad.push(action.scratchpad);

    // Check if task.wait suspended this task (waiting_for set by tool)
    const refreshed = getTask(task.id)!;
    if (refreshed.waiting_for) {
      updateTaskStatus(task.id, 'paused');
      return { ran: true, taskId: task.id };
    }

    // Check if task.done was called
    if (action.tool === 'task.done') {
      const taskResult = result as TaskResult;

      // Persist structured exit result
      setTaskResult(task.id, taskResult);

      // Deliver result to any downstream tasks connected by pipes
      const pipes = getPipesFrom(task.id);
      for (const pipe of pipes) {
        sendMessage(task.id, pipe.to_task_id, 'pipe.result', {
          from_task: task.id,
          goal: task.goal,
          status: taskResult.status,
          output: taskResult.output,
          summary: taskResult.summary,
        });
      }

      // Resume any tasks waiting on this task
      resumeWaiters(task.id, 'complete', taskResult);

      updateTaskStatus(task.id, 'complete');
      return { ran: true, taskId: task.id };
    }
  }

  // Exceeded max steps
  emitEvent('task.step_limit', { steps: maxSteps }, task.id);
  resumeWaiters(task.id, 'failed', null);
  updateTaskStatus(task.id, 'failed');
  return { ran: true, taskId: task.id };
}

export async function runAll(adapter: LLMAdapter): Promise<void> {
  while (true) {
    const result = await runOnce(adapter);
    if (!result.ran) break;
  }
}
