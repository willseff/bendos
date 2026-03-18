import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb, getDb } from '../db/index';
import { createTask, getTask } from '../objects/task';
import { runOnce, runAll } from '../kernel/runtime';
import { receiveMessages } from '../objects/message';
import { MockLLMAdapter } from '../llm/mock';
import { seedToolRegistry } from '../tools/registry';
import { getTool } from '../tools/registry';
import '../tools/builtin/task.spawn';
import '../tools/builtin/task.done';
import '../tools/builtin/task.pipe';
import '../tools/builtin/task.wait';
import '../tools/builtin/signal.send';
import '../tools/builtin/memory.read';
import '../tools/builtin/memory.write';
import '../tools/builtin/artifact.create';
import '../tools/builtin/artifact.read';
import '../tools/builtin/artifact.list';
import '../tools/builtin/state.query';
import '../tools/builtin/message.send';
import '../tools/builtin/message.receive';

describe('task.wait', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    getDb();
    seedToolRegistry();
  });

  afterEach(() => {
    closeDb();
  });

  it('task.wait on an already-complete task returns immediately without suspending', async () => {
    const child = createTask('child');

    // Run child to completion first
    await runOnce(new MockLLMAdapter());
    expect(getTask(child.id)!.status).toBe('complete');

    const parent = createTask('parent');
    const tool = getTool('task.wait')!;
    const result = await tool.execute({ taskId: child.id }, { taskId: parent.id, task: getTask(parent.id)! });

    expect((result as any).waited).toBe(false);
    expect((result as any).status).toBe('complete');
    // Parent was never suspended
    expect(getTask(parent.id)!.waiting_for).toBeNull();
  });

  it('task.wait on a pending task suspends the waiter', async () => {
    const child = createTask('child');
    const parent = createTask('parent');

    const tool = getTool('task.wait')!;
    await tool.execute({ taskId: child.id }, { taskId: parent.id, task: getTask(parent.id)! });

    // waiting_for is now set
    expect(getTask(parent.id)!.waiting_for).toBe(child.id);
  });

  it('completing the waited task resumes the waiter', async () => {
    const child = createTask('child');
    const parent = createTask('parent');

    // Manually set parent waiting on child
    const waitTool = getTool('task.wait')!;
    await waitTool.execute({ taskId: child.id }, { taskId: parent.id, task: getTask(parent.id)! });

    // Simulate runtime pausing parent
    const { updateTaskStatus } = await import('../objects/task');
    updateTaskStatus(parent.id, 'paused');

    // Run child to completion — should resume parent
    await runOnce(new MockLLMAdapter());

    expect(getTask(child.id)!.status).toBe('complete');
    expect(getTask(parent.id)!.status).toBe('pending');
    expect(getTask(parent.id)!.waiting_for).toBeNull();
  });

  it('result is delivered to waiter inbox when child completes', async () => {
    const child = createTask('child');
    const parent = createTask('parent');

    const waitTool = getTool('task.wait')!;
    await waitTool.execute({ taskId: child.id }, { taskId: parent.id, task: getTask(parent.id)! });

    const { updateTaskStatus } = await import('../objects/task');
    updateTaskStatus(parent.id, 'paused');

    await runOnce(new MockLLMAdapter());

    const messages = receiveMessages(parent.id, false);
    expect(messages.some(m => m.type === 'task.result' && m.from_task_id === child.id)).toBe(true);
  });

  it('waiter is resumed if child fails', async () => {
    // Child with capabilities that block step 0 → fails immediately
    const child = createTask('child', { capabilities: ['task.done'] });
    const parent = createTask('parent');

    const waitTool = getTool('task.wait')!;
    await waitTool.execute({ taskId: child.id }, { taskId: parent.id, task: getTask(parent.id)! });

    const { updateTaskStatus } = await import('../objects/task');
    updateTaskStatus(parent.id, 'paused');

    await runOnce(new MockLLMAdapter());

    expect(getTask(child.id)!.status).toBe('failed');
    expect(getTask(parent.id)!.status).toBe('pending');
    expect(getTask(parent.id)!.waiting_for).toBeNull();
  });
});
