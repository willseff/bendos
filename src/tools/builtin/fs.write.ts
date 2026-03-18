import { z } from 'zod';
import { registerTool } from '../registry';
import { writeArtifactByPath } from '../../objects/artifact';
import { normalizePath } from '../../vfs/index';

registerTool({
  name: 'fs.write',
  description: 'Write content to a path in the virtual filesystem, creating or updating the file. Paths under /tmp are public (readable by all tasks). All other paths are private to this task. Use this to produce output files, share data with other tasks via /tmp, or persist work mid-task.',
  inputSchema: z.object({
    path: z.string().min(1).describe('Absolute path, e.g. /output/report.md or /tmp/shared.json'),
    content: z.string().describe('File content to write'),
    mimeType: z.string().optional().describe('MIME type (default: text/plain, or application/json if path ends with .json)'),
  }),
  async execute(input, ctx) {
    const path = normalizePath(input.path);

    // Paths under /tmp are shared between all tasks.
    const isShared = path === '/tmp' || path.startsWith('/tmp/');
    const visibility = isShared ? 'public' : 'private';

    // Infer mime type from extension if not provided.
    const mimeType = input.mimeType ?? inferMime(path);

    const artifact = writeArtifactByPath(path, input.content, ctx.taskId, mimeType, visibility);
    return {
      path: artifact.path,
      size: Buffer.byteLength(input.content, 'utf8'),
      visibility,
      mimeType,
    };
  },
});

function inferMime(path: string): string {
  if (path.endsWith('.json'))  return 'application/json';
  if (path.endsWith('.md'))    return 'text/markdown';
  if (path.endsWith('.html'))  return 'text/html';
  if (path.endsWith('.csv'))   return 'text/csv';
  if (path.endsWith('.ts') || path.endsWith('.js')) return 'text/javascript';
  return 'text/plain';
}
