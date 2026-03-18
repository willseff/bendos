import { z } from 'zod';
import { registerTool } from '../registry';
import { writeMemory } from '../../objects/memory';

registerTool({
  name: 'memory.write',
  description: 'Write a memory for the current task. Use visibility="public" to share it with all tasks.',
  inputSchema: z.object({
    content: z.string().min(1),
    tags: z.array(z.string()).optional(),
    visibility: z.enum(['private', 'public']).optional(),
  }),
  async execute(input, ctx) {
    const memory = writeMemory(input.content, ctx.taskId, input.tags, input.visibility ?? 'private');
    return { id: memory.id, visibility: memory.visibility };
  },
});
