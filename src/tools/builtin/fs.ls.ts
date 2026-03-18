import { z } from 'zod';
import { registerTool } from '../registry';
import { vfsList } from '../../vfs/index';

registerTool({
  name: 'fs.ls',
  description: 'List a directory in the virtual filesystem. Try: / (root mounts), /proc (all tasks), /proc/<taskId> (task files), /agents (agent definitions), or any artifact directory path.',
  inputSchema: z.object({
    path: z.string().default('/'),
  }),
  async execute(input, ctx) {
    const entries = vfsList(input.path, { taskId: ctx.taskId });
    if (entries === null) return { found: false, entries: [] };
    return { found: true, entries };
  },
});
