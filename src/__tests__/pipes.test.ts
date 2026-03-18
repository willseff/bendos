import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb, getDb } from '../db/index';
import { createTask, getTask } from '../objects/task';
import { createPipe } from '../objects/pipe';
import { countUnread, receiveMessages } from '../objects/message';
import { assembleContext } from '../context/assembler';
import { runOnce } from '../kernel/runtime';
import { MockLLMAdapter } from '../llm/mock';
import { seedToolRegistry } from '../tools/registry';
import '../tools/builtin/task.spawn';
import '../tools/builtin/task.done';
import '../tools/builtin/task.pipe';
import '../tools/builtin/memory.read';
import '../tools/builtin/memory.write';
import '../tools/builtin/artifact.create';
import '../tools/builtin/state.query';
import '../tools/builtin/message.send';
import '../tools/builtin/message.receive';

describe('pipes', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    getDb();
    seedToolRegistry();
  });

  afterEach(() => {
    closeDb();
  });

  it('task.done stores a structured result on the task', async () => {
    const task = createTask('test structured exit');
    await runOnce(new MockLLMAdapter());

    const completed = getTask(task.id)!;
    expect(completed.status).toBe('complete');
    expect(completed.result).not.toBeNull();
    expect(completed.result!.status).toBe('ok');
    expect(completed.result!.summary).toContain('Completed');
    expect(completed.result!.output).toEqual({});
  });

  it('delivers pipe.result message to downstream task on completion', async () => {
    const upstream = createTask('upstream task');
    const downstream = createTask('downstream task');

    createPipe(upstream.id, downstream.id);

    await runOnce(new MockLLMAdapter());

    // upstream should be complete
    expect(getTask(upstream.id)!.status).toBe('complete');

    // downstream should have received a pipe.result message
    expect(countUnread(downstream.id)).toBe(1);

    const messages = receiveMessages(downstream.id, false);
    expect(messages[0].type).toBe('pipe.result');
    expect(messages[0].from_task_id).toBe(upstream.id);
    expect((messages[0].payload as any).summary).toContain('Completed');
  });

  it('pipe.result appears in downstream task inbox context', async () => {
    const upstream = createTask('upstream');
    const downstream = createTask('downstream');

    createPipe(upstream.id, downstream.id);
    await runOnce(new MockLLMAdapter());

    const ctx = assembleContext(downstream);
    expect(ctx.inbox.length).toBe(1);
    expect(ctx.inbox[0].type).toBe('pipe.result');
    expect((ctx.inbox[0].payload as any).from_task).toBe(upstream.id);
  });

  it('multiple pipes from one task deliver to all downstream tasks', async () => {
    const source = createTask('source');
    const destA = createTask('dest a');
    const destB = createTask('dest b');

    createPipe(source.id, destA.id);
    createPipe(source.id, destB.id);

    await runOnce(new MockLLMAdapter());

    expect(countUnread(destA.id)).toBe(1);
    expect(countUnread(destB.id)).toBe(1);
  });
});
