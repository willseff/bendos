import { listArtifactsByPath, getArtifactByPath } from '../objects/artifact';
import type { VFSMount, VFSEntry, VFSStat, VFSContext } from './index';

// /tmp — shared writable scratch space.
// Backed by public artifacts with path prefix /tmp.
// Any task can read; writers set visibility='public' via fs.write.
export class TmpMount implements VFSMount {
  read(relPath: string, _ctx: VFSContext): string | null {
    const fullPath = '/tmp' + (relPath === '/' ? '' : relPath);
    // No taskId restriction — public artifacts are readable by all.
    const artifact = getArtifactByPath(fullPath);
    return artifact?.content ?? null;
  }

  list(relPath: string, _ctx: VFSContext): VFSEntry[] | null {
    const fullPath = '/tmp' + (relPath === '/' ? '' : relPath);
    const artifacts = listArtifactsByPath(fullPath);
    if (relPath === '/' && artifacts.length === 0) return [];
    return artifacts.map(a => ({
      name: a.path ? a.path.split('/').pop()! : a.name,
      type: 'file' as const,
    }));
  }

  stat(relPath: string, _ctx: VFSContext): VFSStat | null {
    if (relPath === '/') {
      const count = listArtifactsByPath('/tmp').length;
      return { type: 'dir', size: count };
    }
    const fullPath = '/tmp' + relPath;
    const artifact = getArtifactByPath(fullPath);
    if (!artifact) return null;
    return {
      type: 'file',
      size: Buffer.byteLength(artifact.content, 'utf8'),
      mimeType: artifact.mime_type,
      created_at: artifact.created_at,
    };
  }
}
