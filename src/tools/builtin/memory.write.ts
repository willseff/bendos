import { z } from 'zod';
import { registerTool } from '../registry';
import { writeMemory } from '../../objects/memory';

registerTool({
  name: 'memory.write',
  description: 'Write a new memory, optionally tagged, associated with the current task.',
  inputSchema: z.object({
    content: z.string().min(1),
    tags: z.array(z.string()).optional(),
  }),
  async execute(input, ctx) {
    const memory = writeMemory(input.content, ctx.taskId, input.tags);
    return { id: memory.id };
  },
});
