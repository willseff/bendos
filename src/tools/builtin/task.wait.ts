import { z } from 'zod';
import { registerTool } from '../registry';
import { getTask, setWaitingFor } from '../../objects/task';

registerTool({
  name: 'task.wait',
  description: 'Suspend this task until another task completes, then receive its result in your inbox. If the target is already complete or failed, returns immediately. Use this to join on a spawned child task.',
  inputSchema: z.object({
    taskId: z.string().min(1),
  }),
  async execute(input, ctx) {
    const target = getTask(input.taskId);
    if (!target) throw new Error(`Task not found: ${input.taskId}`);

    // Already terminal — return result immediately, no suspension needed.
    if (target.status === 'complete' || target.status === 'failed') {
      return {
        waited: false,
        status: target.status,
        result: target.result,
      };
    }

    // Set waiting_for — runtime checks this after tool execution and pauses.
    setWaitingFor(ctx.taskId, input.taskId);
    return { waited: true, taskId: input.taskId };
  },
});
