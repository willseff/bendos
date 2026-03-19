import { z } from 'zod';
import { registerTool } from '../registry';
import { getArtifactByPath } from '../../objects/artifact';

registerTool({
  name: 'artifact.read',
  hidden: true,   // superseded by fs.read
  description: 'Read the content of an artifact by its path (e.g. "/reports/summary.md"). Returns null if not found or not visible to this task.',
  inputSchema: z.object({
    path: z.string().min(1),
  }),
  async execute(input, ctx) {
    const artifact = getArtifactByPath(input.path, ctx.taskId);
    if (!artifact) return { found: false, content: null };
    return { found: true, name: artifact.name, path: artifact.path, content: artifact.content, mimeType: artifact.mime_type };
  },
});
