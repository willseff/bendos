import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb, getDb } from '../db/index';
import { createTask, getTask } from '../objects/task';
import { listEvents } from '../objects/event';
import { runOnce } from '../kernel/runtime';
import { MockLLMAdapter } from '../llm/mock';
import { seedToolRegistry } from '../tools/registry';
import '../tools/builtin/task.spawn';
import '../tools/builtin/task.done';
import '../tools/builtin/memory.read';
import '../tools/builtin/memory.write';
import '../tools/builtin/artifact.create';
import '../tools/builtin/artifact.read';
import '../tools/builtin/artifact.list';
import '../tools/builtin/state.query';

describe('runtime', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    getDb();
    seedToolRegistry();
  });

  afterEach(() => {
    closeDb();
  });

  it('completes a task in two steps with the mock adapter', async () => {
    const task = createTask('write a short poem');
    const adapter = new MockLLMAdapter();

    const result = await runOnce(adapter);

    expect(result.ran).toBe(true);
    expect(result.taskId).toBe(task.id);

    const completed = getTask(task.id)!;
    expect(completed.status).toBe('complete');
    expect(completed.step_count).toBe(2);

    const events = listEvents(task.id);
    expect(events.filter(e => e.type === 'action.executed').length).toBe(2);
    expect(events.some(e => e.type === 'task.complete')).toBe(true);
  });

  it('emits action.invalid and fails when LLM returns invalid output', async () => {
    const task = createTask('bad output test');
    const badAdapter = {
      name: 'bad',
      // thought is empty string — fails z.string().min(1)
      complete: async () => ({ thought: '', tool: 'task.done', input: {} }),
    };

    await runOnce(badAdapter as any);

    const failed = getTask(task.id)!;
    expect(failed.status).toBe('failed');

    const events = listEvents(task.id);
    expect(events.some(e => e.type === 'action.invalid')).toBe(true);
  });
});
