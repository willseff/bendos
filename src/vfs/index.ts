import { getArtifactByPath, listArtifactsByPath } from '../objects/artifact';

// ─── VFS core ─────────────────────────────────────────────────────────────────
//
// A minimal virtual filesystem with explicit mount points.
// Mounts handle their own subtree; unmounted paths fall through to artifacts.
//
// Mount table example:
//   /proc   → ProcMount   (synthetic — live task state)
//   /agents → AgentMount  (synthetic — agent definitions)
//
// Any path not claimed by a mount is resolved as an artifact by exact path.

export interface VFSEntry {
  name: string;
  type: 'file' | 'dir';
}

export interface VFSStat {
  type: 'file' | 'dir';
  size: number;          // bytes for files, entry count for dirs
  mimeType?: string;
  created_at?: number;
  updated_at?: number;
}

export interface VFSContext {
  taskId?: string;
}

export interface VFSMount {
  read(relPath: string, ctx: VFSContext): string | null;
  list(relPath: string, ctx: VFSContext): VFSEntry[] | null;
  stat(relPath: string, ctx: VFSContext): VFSStat | null;
}

// ─── mount registry ───────────────────────────────────────────────────────────

const mountTable = new Map<string, VFSMount>();

export function mount(prefix: string, impl: VFSMount): void {
  const norm = normalizePrefix(prefix);
  mountTable.set(norm, impl);
}

export function getMounts(): Map<string, VFSMount> {
  return mountTable;
}

// Find the longest mount prefix that covers `path`, return mount + relative path.
function resolve(path: string): { mount: VFSMount; prefix: string; rel: string } | null {
  let bestLen = -1;
  let best: { mount: VFSMount; prefix: string; rel: string } | null = null;

  for (const [prefix, m] of mountTable) {
    if (path === prefix || path.startsWith(prefix + '/')) {
      if (prefix.length > bestLen) {
        bestLen = prefix.length;
        best = { mount: m, prefix, rel: path.slice(prefix.length) || '/' };
      }
    }
  }

  return best;
}

// ─── public API ───────────────────────────────────────────────────────────────

export function vfsRead(path: string, ctx: VFSContext = {}): string | null {
  const norm = normalizePath(path);
  const r = resolve(norm);
  if (r) return r.mount.read(r.rel, ctx);

  // Fallback: artifact by exact path.
  const artifact = getArtifactByPath(norm, ctx.taskId);
  return artifact ? artifact.content : null;
}

export function vfsList(path: string, ctx: VFSContext = {}): VFSEntry[] | null {
  const norm = normalizePath(path);

  // Root: enumerate mount points.
  if (norm === '/') {
    return Array.from(mountTable.keys()).map(prefix => ({
      name: prefix.slice(1),
      type: 'dir' as const,
    }));
  }

  // Exact mount point hit — list its root.
  if (mountTable.has(norm)) {
    return mountTable.get(norm)!.list('/', ctx);
  }

  const r = resolve(norm);
  if (r) return r.mount.list(r.rel, ctx);

  // Fallback: artifact directory listing.
  const artifacts = listArtifactsByPath(norm, ctx.taskId);
  if (artifacts.length > 0) {
    return artifacts.map((a: any) => ({
      name: a.path ? a.path.split('/').pop() : a.name,
      type: 'file' as const,
    }));
  }

  return null;
}

export function vfsStat(path: string, ctx: VFSContext = {}): VFSStat | null {
  const norm = normalizePath(path);

  // Root is always a directory.
  if (norm === '/') {
    return { type: 'dir', size: mountTable.size };
  }

  // Exact mount point — stat its root.
  if (mountTable.has(norm)) {
    return mountTable.get(norm)!.stat('/', ctx);
  }

  const r = resolve(norm);
  if (r) return r.mount.stat(r.rel, ctx);

  // Fallback: artifact stat.
  const artifact = getArtifactByPath(norm, ctx.taskId);
  if (artifact) {
    return {
      type: 'file',
      size: Buffer.byteLength(artifact.content, 'utf8'),
      mimeType: artifact.mime_type,
      created_at: artifact.created_at,
    };
  }

  return null;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

export function normalizePath(p: string): string {
  const s = p.startsWith('/') ? p : '/' + p;
  return s.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function normalizePrefix(p: string): string {
  return '/' + p.replace(/^\//, '').replace(/\/$/, '');
}
