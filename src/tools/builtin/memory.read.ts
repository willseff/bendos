import { z } from 'zod';
import { registerTool } from '../registry';
import { readMemory, queryMemories } from '../../objects/memory';

registerTool({
  name: 'memory.read',
  description: 'Read a specific memory by id, or query memories by tag for the current task.',
  inputSchema: z.object({
    id: z.string().optional(),
    tag: z.string().optional(),
  }),
  async execute(input, ctx) {
    if (input.id) {
      // Enforce isolation: private memories of other tasks are not visible.
      return readMemory(input.id, ctx.taskId) ?? { error: 'not found or not accessible' };
    }
    return queryMemories(ctx.taskId, input.tag);
  },
});
