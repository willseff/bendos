import { z } from 'zod';
import { registerTool } from '../registry';
import { emitEvent } from '../../objects/event';

registerTool({
  name: 'task.done',
  description: 'Mark the current task as complete with a summary.',
  inputSchema: z.object({
    summary: z.string().min(1),
  }),
  async execute(input, ctx) {
    emitEvent('task.complete', { summary: input.summary }, ctx.taskId);
    return { done: true, summary: input.summary };
  },
});
