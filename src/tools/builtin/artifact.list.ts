import { z } from 'zod';
import { registerTool } from '../registry';
import { listArtifacts, listArtifactsByPath } from '../../objects/artifact';

registerTool({
  name: 'artifact.list',
  hidden: true,   // superseded by fs.ls
  description: 'List artifacts visible to this task. Provide a path prefix to list a directory (e.g. "/reports"). Omit prefix to list all visible artifacts.',
  inputSchema: z.object({
    prefix: z.string().optional(),
  }),
  async execute(input, ctx) {
    const artifacts = input.prefix
      ? listArtifactsByPath(input.prefix, ctx.taskId)
      : listArtifacts(ctx.taskId);
    return artifacts.map(a => ({
      name: a.name,
      path: a.path,
      mimeType: a.mime_type,
      visibility: a.visibility,
    }));
  },
});
