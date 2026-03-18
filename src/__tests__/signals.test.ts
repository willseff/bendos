import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb, getDb } from '../db/index';
import { createTask, getTask } from '../objects/task';
import { sendSignal } from '../objects/signal';
import { listEvents } from '../objects/event';
import { countUnread } from '../objects/message';
import { processResumeSignals } from '../kernel/scheduler';
import { runOnce } from '../kernel/runtime';
import { MockLLMAdapter } from '../llm/mock';
import { seedToolRegistry } from '../tools/registry';
import '../tools/builtin/task.spawn';
import '../tools/builtin/task.done';
import '../tools/builtin/task.pipe';
import '../tools/builtin/signal.send';
import '../tools/builtin/memory.read';
import '../tools/builtin/memory.write';
import '../tools/builtin/artifact.create';
import '../tools/builtin/artifact.read';
import '../tools/builtin/artifact.list';
import '../tools/builtin/state.query';
import '../tools/builtin/message.send';
import '../tools/builtin/message.receive';

describe('signals', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    getDb();
    seedToolRegistry();
  });

  afterEach(() => {
    closeDb();
  });

  it('cancel signal stops a task immediately with 0 steps', async () => {
    const task = createTask('task to cancel');
    sendSignal(task.id, 'cancel');

    await runOnce(new MockLLMAdapter());

    const result = getTask(task.id)!;
    expect(result.status).toBe('failed');
    expect(result.step_count).toBe(0);

    const events = listEvents(task.id);
    expect(events.some(e => e.type === 'signal.delivered' && (e.payload as any).type === 'cancel')).toBe(true);
  });

  it('pause signal suspends a task, resume unpauses it', async () => {
    const task = createTask('task to pause');
    sendSignal(task.id, 'pause');

    await runOnce(new MockLLMAdapter());

    const paused = getTask(task.id)!;
    expect(paused.status).toBe('paused');
    expect(paused.step_count).toBe(0);

    // Scheduler won't pick it up while paused
    sendSignal(task.id, 'resume');
    processResumeSignals();

    const resumed = getTask(task.id)!;
    expect(resumed.status).toBe('pending');

    // Now it runs to completion
    await runOnce(new MockLLMAdapter());
    expect(getTask(task.id)!.status).toBe('complete');
  });

  it('inject signal delivers payload to inbox without stopping execution', async () => {
    const task = createTask('task with inject');
    sendSignal(task.id, 'inject', { directive: 'focus on performance' });

    await runOnce(new MockLLMAdapter());

    // Task should complete normally — inject doesn't interrupt
    expect(getTask(task.id)!.status).toBe('complete');

    const events = listEvents(task.id);
    expect(events.some(e => e.type === 'signal.delivered' && (e.payload as any).type === 'inject')).toBe(true);

    // Injected message stays in inbox (mock never called message.receive)
    expect(countUnread(task.id)).toBe(1);
  });

  it('cancel takes priority — queued signals are processed in order', async () => {
    const task = createTask('task with multiple signals');
    sendSignal(task.id, 'inject', { msg: 'first' });
    sendSignal(task.id, 'cancel');

    await runOnce(new MockLLMAdapter());

    // inject is processed on step 0, cancel on step 1 — but mock does
    // memory.write on step 0 and task.done on step 1.
    // Actually: inject is delivered on step 0 (execution continues),
    // cancel is delivered on step 1 (before task.done runs) → failed.
    const result = getTask(task.id)!;
    // Task gets the inject on step 0 (continues), then cancel on step 1 (stops).
    expect(result.status).toBe('failed');
  });
});
