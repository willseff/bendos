import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb, getDb } from '../db/index';
import { createTask } from '../objects/task';
import { vfsRead, vfsList, vfsStat } from '../vfs/index';
import { writeArtifactByPath } from '../objects/artifact';

import '../vfs/init';
import '../tools/builtin/fs.write';
import '../tools/builtin/fs.read';
import '../tools/builtin/fs.ls';
import '../tools/builtin/fs.stat';

import { getTool } from '../tools/registry';

describe('fs.write tool', () => {
  let taskId: string;

  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    getDb();
    taskId = createTask('writer').id;
  });

  afterEach(() => { closeDb(); });

  async function write(path: string, content: string, mimeType?: string) {
    const tool = getTool('fs.write')!;
    return tool.execute({ path, content, mimeType }, { taskId, task: createTask('x') });
  }

  it('creates a file and reads it back', async () => {
    await write('/output/report.md', '# Hello');
    expect(vfsRead('/output/report.md', { taskId })).toBe('# Hello');
  });

  it('updates existing file in place on second write', async () => {
    await write('/output/data.json', '{"v":1}');
    await write('/output/data.json', '{"v":2}');
    expect(vfsRead('/output/data.json', { taskId })).toBe('{"v":2}');
  });

  it('infers mime type from extension', async () => {
    await write('/out/file.json', '{}');
    const stat = vfsStat('/out/file.json', { taskId })!;
    expect(stat.mimeType).toBe('application/json');
  });

  it('private file is not readable by another task', async () => {
    await write('/secret/file.txt', 'classified');
    const other = createTask('other').id;
    expect(vfsRead('/secret/file.txt', { taskId: other })).toBeNull();
  });

  it('/tmp paths are public — readable by any task', async () => {
    await write('/tmp/shared.txt', 'hello everyone');
    const other = createTask('other').id;
    expect(vfsRead('/tmp/shared.txt', { taskId: other })).toBe('hello everyone');
  });

  it('/tmp paths are public — readable without any taskId', async () => {
    await write('/tmp/open.txt', 'public data');
    expect(vfsRead('/tmp/open.txt')).toBe('public data');
  });

  it('returns path, size, visibility, mimeType', async () => {
    const result = await write('/tmp/info.md', '# test') as any;
    expect(result.path).toBe('/tmp/info.md');
    expect(result.size).toBeGreaterThan(0);
    expect(result.visibility).toBe('public');
    expect(result.mimeType).toBe('text/markdown');
  });
});

describe('/tmp VFS mount', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    getDb();
  });

  afterEach(() => { closeDb(); });

  it('/tmp lists as a dir from root', () => {
    const entries = vfsList('/');
    expect(entries!.some(e => e.name === 'tmp')).toBe(true);
  });

  it('/tmp returns empty list when nothing written', () => {
    const entries = vfsList('/tmp');
    expect(entries).not.toBeNull();
    expect(entries!.length).toBe(0);
  });

  it('/tmp lists files after write', () => {
    writeArtifactByPath('/tmp/a.txt', 'a', undefined, 'text/plain', 'public');
    writeArtifactByPath('/tmp/b.txt', 'b', undefined, 'text/plain', 'public');
    const entries = vfsList('/tmp')!;
    expect(entries.some(e => e.name === 'a.txt')).toBe(true);
    expect(entries.some(e => e.name === 'b.txt')).toBe(true);
  });

  it('fs.stat /tmp returns dir', () => {
    const stat = vfsStat('/tmp')!;
    expect(stat.type).toBe('dir');
  });

  it('fs.stat /tmp/<file> returns file metadata', () => {
    writeArtifactByPath('/tmp/check.json', '{}', undefined, 'application/json', 'public');
    const stat = vfsStat('/tmp/check.json')!;
    expect(stat.type).toBe('file');
    expect(stat.mimeType).toBe('application/json');
  });
});

describe('per-task environment', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    getDb();
  });

  afterEach(() => { closeDb(); });

  it('env is null when not set', () => {
    const task = createTask('no env');
    expect(task.env).toBeNull();
  });

  it('env is stored and returned on task', () => {
    const task = createTask('has env', { env: { API_KEY: 'abc', FORMAT: 'json' } });
    expect(task.env).toEqual({ API_KEY: 'abc', FORMAT: 'json' });
  });

  it('/proc/self/env returns env as JSON', () => {
    const task = createTask('env task', { env: { FOO: 'bar' } });
    const raw = vfsRead('/proc/self/env', { taskId: task.id })!;
    const parsed = JSON.parse(raw);
    expect(parsed.FOO).toBe('bar');
  });

  it('/proc/self/env returns empty object when no env set', () => {
    const task = createTask('no env');
    const raw = vfsRead('/proc/self/env', { taskId: task.id })!;
    expect(JSON.parse(raw)).toEqual({});
  });

  it('/proc/<id> lists env as a file', () => {
    const task = createTask('env task');
    const entries = vfsList(`/proc/${task.id}`)!;
    expect(entries.some(e => e.name === 'env')).toBe(true);
  });
});
