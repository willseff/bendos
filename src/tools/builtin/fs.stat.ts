import { z } from 'zod';
import { registerTool } from '../registry';
import { vfsStat } from '../../vfs/index';

registerTool({
  name: 'fs.stat',
  description: 'Stat a path in the virtual filesystem. Returns type (file/dir), size, mimeType, and timestamps. Returns found=false if path does not exist.',
  inputSchema: z.object({
    path: z.string().min(1),
  }),
  async execute(input, ctx) {
    const stat = vfsStat(input.path, { taskId: ctx.taskId });
    if (!stat) return { found: false, stat: null };
    return { found: true, stat };
  },
});
