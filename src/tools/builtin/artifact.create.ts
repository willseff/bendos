import { z } from 'zod';
import { registerTool } from '../registry';
import { createArtifact } from '../../objects/artifact';

registerTool({
  name: 'artifact.create',
  hidden: true,   // superseded by fs.write
  description: 'Write an artifact (file) for the current task. Provide a path like "/reports/summary.md" to place it in a directory. Use visibility="public" to share with all tasks.',
  inputSchema: z.object({
    name: z.string().min(1),
    content: z.string(),
    path: z.string().optional(),
    mimeType: z.string().optional(),
    visibility: z.enum(['private', 'public']).optional(),
  }),
  async execute(input, ctx) {
    const artifact = createArtifact(input.name, input.content, ctx.taskId, input.mimeType, input.visibility ?? 'private', input.path);
    return { id: artifact.id, name: artifact.name, path: artifact.path, visibility: artifact.visibility };
  },
});
