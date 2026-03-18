import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb, getDb } from '../db/index';
import { createTask } from '../objects/task';
import { getNextTask } from '../kernel/scheduler';

describe('scheduler priorities', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    getDb();
  });

  afterEach(() => {
    closeDb();
  });

  it('default priority is 0', () => {
    const task = createTask('default priority task');
    expect(task.priority).toBe(0);
  });

  it('higher priority task is selected before lower priority', () => {
    createTask('low priority', { priority: 0 });
    const high = createTask('high priority', { priority: 10 });

    const next = getNextTask();
    expect(next!.id).toBe(high.id);
  });

  it('tasks with same priority are FIFO', () => {
    const first = createTask('first', { priority: 5 });
    createTask('second', { priority: 5 });

    const next = getNextTask();
    expect(next!.id).toBe(first.id);
  });

  it('negative priority runs last', () => {
    const normal = createTask('normal', { priority: 0 });
    createTask('background', { priority: -5 });

    const next = getNextTask();
    expect(next!.id).toBe(normal.id);
  });

  it('priority overrides FIFO ordering', () => {
    // Create low-priority first (would win in pure FIFO)
    createTask('created first but low priority', { priority: 1 });
    const urgent = createTask('created second but urgent', { priority: 99 });

    const next = getNextTask();
    expect(next!.id).toBe(urgent.id);
  });

  it('getNextTask returns null when no pending tasks', () => {
    expect(getNextTask()).toBeNull();
  });
});
