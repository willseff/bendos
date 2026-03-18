import { z } from 'zod';
import { registerTool } from '../registry';
import { createArtifact } from '../../objects/artifact';

registerTool({
  name: 'artifact.create',
  description: 'Create a named artifact (file-like content) associated with the current task.',
  inputSchema: z.object({
    name: z.string().min(1),
    content: z.string(),
    mimeType: z.string().optional(),
  }),
  async execute(input, ctx) {
    const artifact = createArtifact(input.name, input.content, ctx.taskId, input.mimeType);
    return { id: artifact.id, name: artifact.name };
  },
});
