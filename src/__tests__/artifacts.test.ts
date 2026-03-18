import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb, getDb } from '../db/index';
import { createTask } from '../objects/task';
import { createArtifact, getArtifactByPath, listArtifacts, listArtifactsByPath } from '../objects/artifact';

describe('artifact filesystem', () => {
  let t1: string;
  let t2: string;

  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    getDb();
    t1 = createTask('task one').id;
    t2 = createTask('task two').id;
  });

  afterEach(() => {
    closeDb();
  });

  it('creates artifact with a path', () => {
    const a = createArtifact('summary', 'hello', t1, 'text/plain', 'private', '/reports/summary.md');
    expect(a.path).toBe('/reports/summary.md');
    expect(a.name).toBe('summary');
  });

  it('creates artifact without a path (flat, backward-compatible)', () => {
    const a = createArtifact('flat', 'content', t1);
    expect(a.path).toBeNull();
  });

  it('getArtifactByPath returns artifact for owner', () => {
    createArtifact('file', 'data', t1, undefined, 'private', '/data/output.json');
    const found = getArtifactByPath('/data/output.json', t1);
    expect(found).not.toBeNull();
    expect(found!.content).toBe('data');
  });

  it('getArtifactByPath blocks private artifact from another task', () => {
    createArtifact('file', 'secret', t1, undefined, 'private', '/private/file.txt');
    const found = getArtifactByPath('/private/file.txt', t2);
    expect(found).toBeNull();
  });

  it('getArtifactByPath allows public artifact from any task', () => {
    createArtifact('shared', 'shared data', t1, undefined, 'public', '/shared/data.txt');
    const found = getArtifactByPath('/shared/data.txt', t2);
    expect(found).not.toBeNull();
    expect(found!.content).toBe('shared data');
  });

  it('listArtifactsByPath returns items in a directory', () => {
    createArtifact('a', 'a', t1, undefined, 'private', '/reports/a.md');
    createArtifact('b', 'b', t1, undefined, 'private', '/reports/b.md');
    createArtifact('c', 'c', t1, undefined, 'private', '/other/c.md');

    const results = listArtifactsByPath('/reports', t1);
    expect(results).toHaveLength(2);
    expect(results.map(r => r.path)).toEqual(['/reports/a.md', '/reports/b.md']);
  });

  it('listArtifactsByPath excludes private artifacts from other tasks', () => {
    createArtifact('mine', 'mine', t1, undefined, 'private', '/reports/mine.md');
    createArtifact('theirs', 'theirs', t2, undefined, 'private', '/reports/theirs.md');
    createArtifact('shared', 'shared', t2, undefined, 'public', '/reports/shared.md');

    const results = listArtifactsByPath('/reports', t1);
    const paths = results.map(r => r.path);
    expect(paths).toContain('/reports/mine.md');
    expect(paths).toContain('/reports/shared.md');
    expect(paths).not.toContain('/reports/theirs.md');
  });

  it('listArtifacts includes path in results', () => {
    createArtifact('report', 'content', t1, undefined, 'private', '/reports/report.md');
    const all = listArtifacts(t1);
    expect(all[0].path).toBe('/reports/report.md');
  });
});
