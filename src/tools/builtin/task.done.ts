import { z } from 'zod';
import { registerTool } from '../registry';
import { emitEvent } from '../../objects/event';

registerTool({
  name: 'task.done',
  description: 'Mark the current task as complete. Provide a summary and optional structured output for downstream tasks.',
  inputSchema: z.object({
    summary: z.string().min(1).describe('Human-readable summary of what was accomplished'),
    status: z.enum(['ok', 'error']).default('ok').describe('Exit status'),
    output: z.record(z.unknown()).optional().default({}).describe('Structured output for piped tasks'),
  }),
  async execute(input, ctx) {
    const result = { status: input.status, output: input.output ?? {}, summary: input.summary };
    emitEvent('task.complete', result, ctx.taskId);
    return result;
  },
});
