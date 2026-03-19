import { z } from 'zod';
import { registerTool } from '../registry';
import { readMemory, queryMemories } from '../../objects/memory';

registerTool({
  name: 'memory.read',
  description: 'Search your memories by tag, or fetch a specific memory by ID. Your memories are already shown in context each step — only call this when you need to filter by a specific tag or look up a memory by ID.',
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
