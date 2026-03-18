import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb, getDb } from '../db/index';
import { createTask, updateTaskStatus, recoverStaleTasks, listTasks } from '../objects/task';

describe('stale task recovery', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    getDb();
  });

  afterEach(() => { closeDb(); });

  it('resets running tasks to pending', () => {
    const t = createTask('stuck task');
    updateTaskStatus(t.id, 'running');
    expect(recoverStaleTasks()).toBe(1);
    expect(listTasks().find(x => x.id === t.id)!.status).toBe('pending');
  });

  it('does not touch pending, complete, or failed tasks', () => {
    const pending  = createTask('pending');
    const complete = createTask('complete');
    const failed   = createTask('failed');
    updateTaskStatus(complete.id, 'complete');
    updateTaskStatus(failed.id,   'failed');

    expect(recoverStaleTasks()).toBe(0);

    const tasks = listTasks();
    expect(tasks.find(t => t.id === pending.id)!.status).toBe('pending');
    expect(tasks.find(t => t.id === complete.id)!.status).toBe('complete');
    expect(tasks.find(t => t.id === failed.id)!.status).toBe('failed');
  });

  it('returns count of recovered tasks', () => {
    const a = createTask('a');
    const b = createTask('b');
    const c = createTask('c');
    updateTaskStatus(a.id, 'running');
    updateTaskStatus(b.id, 'running');
    updateTaskStatus(c.id, 'complete');
    expect(recoverStaleTasks()).toBe(2);
  });

  it('returns 0 when nothing is stale', () => {
    createTask('fresh');
    expect(recoverStaleTasks()).toBe(0);
  });
});
