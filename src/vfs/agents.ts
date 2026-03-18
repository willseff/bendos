import { getAgent, listAgents } from '../agents/registry';
import type { VFSMount, VFSEntry, VFSStat, VFSContext } from './index';

export class AgentMount implements VFSMount {
  read(relPath: string, _ctx: VFSContext): string | null {
    // /<name>
    const m = relPath.match(/^\/([^/]+)$/);
    if (!m) return null;
    const def = getAgent(m[1]);
    return def ? JSON.stringify(def, null, 2) : null;
  }

  list(relPath: string, _ctx: VFSContext): VFSEntry[] | null {
    if (relPath !== '/') return null;
    return listAgents().map(a => ({ name: a.name, type: 'file' as const }));
  }

  stat(relPath: string, _ctx: VFSContext): VFSStat | null {
    if (relPath === '/') {
      return { type: 'dir', size: listAgents().length };
    }
    const m = relPath.match(/^\/([^/]+)$/);
    if (m) {
      const def = getAgent(m[1]);
      if (!def) return null;
      const content = JSON.stringify(def, null, 2);
      return {
        type: 'file',
        size: Buffer.byteLength(content, 'utf8'),
        mimeType: 'application/json',
      };
    }
    return null;
  }
}
