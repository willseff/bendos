import { z } from 'zod';
import { registerTool } from '../registry';
import { createArtifact } from '../../objects/artifact';

registerTool({
  name: 'artifact.create',
  description: 'Create a named artifact for the current task. Use visibility="public" to share it with all tasks.',
  inputSchema: z.object({
    name: z.string().min(1),
    content: z.string(),
    mimeType: z.string().optional(),
    visibility: z.enum(['private', 'public']).optional(),
  }),
  async execute(input, ctx) {
    const artifact = createArtifact(input.name, input.content, ctx.taskId, input.mimeType, input.visibility ?? 'private');
    return { id: artifact.id, name: artifact.name, visibility: artifact.visibility };
  },
});
