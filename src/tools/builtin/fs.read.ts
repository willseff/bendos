import { z } from 'zod';
import { registerTool } from '../registry';
import { vfsRead } from '../../vfs/index';

registerTool({
  name: 'fs.read',
  description: 'Read a file from the virtual filesystem. Examples: /proc/<taskId>/status, /proc/<taskId>/events, /agents/<name>, or any artifact path like /reports/summary.md.',
  inputSchema: z.object({
    path: z.string().min(1),
  }),
  async execute(input, ctx) {
    const content = vfsRead(input.path, { taskId: ctx.taskId });
    if (content === null) return { found: false, content: null };
    return { found: true, content };
  },
});
