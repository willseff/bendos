import { z } from 'zod';
import { registerTool } from '../registry';
import { createPipe } from '../../objects/pipe';
import { emitEvent } from '../../objects/event';

registerTool({
  name: 'task.pipe',
  description: 'Connect this task to a downstream task. When this task completes, its output is delivered to the downstream task\'s inbox as a pipe.result message.',
  inputSchema: z.object({
    to: z.string().min(1).describe('Downstream task ID'),
  }),
  async execute(input, ctx) {
    const pipe = createPipe(ctx.taskId, input.to);
    emitEvent('pipe.created', { to: input.to, pipeId: pipe.id }, ctx.taskId);
    return { pipeId: pipe.id };
  },
});
