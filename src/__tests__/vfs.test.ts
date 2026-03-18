import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb, getDb } from '../db/index';
import { createTask } from '../objects/task';
import { createArtifact } from '../objects/artifact';
import { writeMemory } from '../objects/memory';
import { emitEvent } from '../objects/event';
import { sendMessage } from '../objects/message';
import { registerAgent } from '../agents/registry';
import { vfsRead, vfsList, vfsStat, mount, getMounts } from '../vfs/index';
import { ProcMount } from '../vfs/proc';
import { AgentMount } from '../vfs/agents';

// Register standard mounts for all tests.
import '../vfs/init';

describe('VFS mount table', () => {
  it('init registers /proc and /agents mounts', () => {
    const mounts = getMounts();
    expect(mounts.has('/proc')).toBe(true);
    expect(mounts.has('/agents')).toBe(true);
  });

  it('/ lists all mounted prefixes as dirs', () => {
    const entries = vfsList('/');
    const names = entries!.map(e => e.name);
    expect(names).toContain('proc');
    expect(names).toContain('agents');
    expect(entries!.every(e => e.type === 'dir')).toBe(true);
  });

  it('fs.stat / returns dir with size = mount count', () => {
    const stat = vfsStat('/');
    expect(stat!.type).toBe('dir');
    expect(stat!.size).toBeGreaterThanOrEqual(2);
  });

  it('custom mount is resolvable', () => {
    const stub: import('../vfs/index').VFSMount = {
      read: () => 'hello',
      list: () => [{ name: 'x', type: 'file' }],
      stat: () => ({ type: 'file', size: 5 }),
    };
    mount('/custom', stub);
    expect(vfsRead('/custom/anything')).toBe('hello');
    expect(vfsList('/custom')).toEqual([{ name: 'x', type: 'file' }]);
  });
});

describe('/proc synthetic mount', () => {
  let taskId: string;

  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    getDb();
    taskId = createTask('test task').id;
  });

  afterEach(() => {
    closeDb();
  });

  it('/proc lists tasks by 8-char prefix', () => {
    const entries = vfsList('/proc');
    expect(entries!.some(e => taskId.startsWith(e.name))).toBe(true);
    expect(entries!.every(e => e.type === 'dir')).toBe(true);
  });

  it('/proc/<taskId> lists status, events, inbox, memory', () => {
    const entries = vfsList(`/proc/${taskId}`);
    const names = entries!.map(e => e.name);
    expect(names).toContain('status');
    expect(names).toContain('events');
    expect(names).toContain('inbox');
    expect(names).toContain('memory');
    expect(entries!.every(e => e.type === 'file')).toBe(true);
  });

  it('/proc/<prefix> resolves by 8-char prefix', () => {
    const prefix = taskId.slice(0, 8);
    expect(vfsList(`/proc/${prefix}`)).not.toBeNull();
  });

  it('/proc/<taskId>/status is valid JSON with task fields', () => {
    const raw = vfsRead(`/proc/${taskId}/status`);
    const parsed = JSON.parse(raw!);
    expect(parsed.id).toBe(taskId);
    expect(parsed.goal).toBe('test task');
    expect(parsed.status).toBe('pending');
    expect(parsed).toHaveProperty('priority');
    expect(parsed).toHaveProperty('step_count');
    expect(parsed).toHaveProperty('result');
  });

  it('/proc/self resolves to the calling task', () => {
    const viaSelf = vfsRead(`/proc/self/status`, { taskId });
    const viaDirect = vfsRead(`/proc/${taskId}/status`, { taskId });
    expect(viaSelf).toBe(viaDirect);
  });

  it('/proc/self/status lists the calling task id', () => {
    const parsed = JSON.parse(vfsRead('/proc/self/status', { taskId })!);
    expect(parsed.id).toBe(taskId);
  });

  it('fs.ls /proc/self lists proc files', () => {
    const entries = vfsList('/proc/self', { taskId });
    expect(entries).not.toBeNull();
    expect(entries!.map(e => e.name)).toContain('status');
  });

  it('fs.stat /proc/self returns dir', () => {
    const stat = vfsStat('/proc/self', { taskId });
    expect(stat!.type).toBe('dir');
  });

  it('/proc/self without taskId returns null', () => {
    // No taskId in context — "self" cannot resolve
    expect(vfsRead('/proc/self/status', {})).toBeNull();
  });

  it('/proc/<taskId>/events returns event array', () => {
    emitEvent('test.event', { x: 1 }, taskId);
    const events = JSON.parse(vfsRead(`/proc/${taskId}/events`)!);
    expect(events.some((e: any) => e.type === 'test.event')).toBe(true);
  });

  it('/proc/<taskId>/inbox returns unread messages without consuming them', () => {
    const other = createTask('other');
    sendMessage(other.id, taskId, 'ping', { hello: true });
    const msgs = JSON.parse(vfsRead(`/proc/${taskId}/inbox`)!);
    expect(msgs.some((m: any) => m.type === 'ping')).toBe(true);
    // Reading again still returns the message (peek, not consume)
    const msgs2 = JSON.parse(vfsRead(`/proc/${taskId}/inbox`)!);
    expect(msgs2).toHaveLength(msgs.length);
  });

  it('/proc/<taskId>/memory returns task memories', () => {
    writeMemory('key fact', taskId, ['tag']);
    const mems = JSON.parse(vfsRead(`/proc/${taskId}/memory`)!);
    expect(mems.some((m: any) => m.content === 'key fact')).toBe(true);
  });

  it('fs.stat /proc returns dir with task count', () => {
    const stat = vfsStat('/proc');
    expect(stat!.type).toBe('dir');
    expect(stat!.size).toBeGreaterThanOrEqual(1);
  });

  it('fs.stat /proc/<taskId> returns dir with 4 entries', () => {
    const stat = vfsStat(`/proc/${taskId}`);
    expect(stat!.type).toBe('dir');
    expect(stat!.size).toBe(4);
    expect(stat!.updated_at).toBeDefined();
  });

  it('fs.stat /proc/<taskId>/status returns file with size and mimeType', () => {
    const stat = vfsStat(`/proc/${taskId}/status`);
    expect(stat!.type).toBe('file');
    expect(stat!.size).toBeGreaterThan(0);
    expect(stat!.mimeType).toBe('application/json');
  });

  it('/proc/<unknown>/status returns null', () => {
    expect(vfsRead('/proc/doesnotexist/status')).toBeNull();
  });
});

describe('/agents synthetic mount', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    getDb();
  });

  afterEach(() => {
    closeDb();
  });

  it('/agents lists registered agents as files', () => {
    registerAgent({ name: 'worker', description: 'w', systemPrompt: 'work' });
    const entries = vfsList('/agents');
    expect(entries!.some(e => e.name === 'worker' && e.type === 'file')).toBe(true);
  });

  it('/agents/<name> returns agent def JSON', () => {
    registerAgent({ name: 'myagent', description: 'd', systemPrompt: 'p' });
    const raw = vfsRead('/agents/myagent');
    const parsed = JSON.parse(raw!);
    expect(parsed.name).toBe('myagent');
    expect(parsed.systemPrompt).toBe('p');
  });

  it('fs.stat /agents/<name> returns file with json mimeType', () => {
    registerAgent({ name: 'bot', description: 'd', systemPrompt: 'p' });
    const stat = vfsStat('/agents/bot');
    expect(stat!.type).toBe('file');
    expect(stat!.mimeType).toBe('application/json');
    expect(stat!.size).toBeGreaterThan(0);
  });

  it('/agents/<unknown> returns null', () => {
    expect(vfsRead('/agents/ghost')).toBeNull();
    expect(vfsStat('/agents/ghost')).toBeNull();
  });
});

describe('artifact fallback (no explicit mount)', () => {
  let taskId: string;

  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    getDb();
    taskId = createTask('owner').id;
  });

  afterEach(() => {
    closeDb();
  });

  it('artifact path resolves directly without a /data prefix', () => {
    createArtifact('report', 'hello world', taskId, 'text/plain', 'private', '/reports/report.md');
    expect(vfsRead('/reports/report.md', { taskId })).toBe('hello world');
  });

  it('fs.stat on an artifact path returns file metadata', () => {
    createArtifact('doc', 'content', taskId, 'text/markdown', 'private', '/docs/index.md');
    const stat = vfsStat('/docs/index.md', { taskId });
    expect(stat!.type).toBe('file');
    expect(stat!.mimeType).toBe('text/markdown');
    expect(stat!.size).toBe(Buffer.byteLength('content', 'utf8'));
  });

  it('artifact directory listing works via vfsList', () => {
    createArtifact('a', 'a', taskId, undefined, 'private', '/data/a.txt');
    createArtifact('b', 'b', taskId, undefined, 'private', '/data/b.txt');
    const entries = vfsList('/data', { taskId });
    expect(entries!).toHaveLength(2);
    expect(entries!.every(e => e.type === 'file')).toBe(true);
  });

  it('unmounted, non-artifact path returns null', () => {
    expect(vfsRead('/nowhere/file.txt')).toBeNull();
    expect(vfsList('/nowhere')).toBeNull();
    expect(vfsStat('/nowhere/file.txt')).toBeNull();
  });

  it('private artifact is not readable by another task', () => {
    createArtifact('secret', 'classified', taskId, undefined, 'private', '/private/secret.txt');
    const other = createTask('other').id;
    expect(vfsRead('/private/secret.txt', { taskId: other })).toBeNull();
  });
});
