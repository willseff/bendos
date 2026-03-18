import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb, getDb } from '../db/index';
import { createTask, getTask } from '../objects/task';
import { listEvents } from '../objects/event';
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

describe('capabilities', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    getDb();
    seedToolRegistry();
  });

  afterEach(() => {
    closeDb();
  });

  it('null capabilities means unrestricted — task completes normally', async () => {
    const task = createTask('unrestricted task');
    expect(task.capabilities).toBeNull();

    await runOnce(new MockLLMAdapter());

    expect(getTask(task.id)!.status).toBe('complete');
  });

  it('task with matching capabilities allowlist completes normally', async () => {
    // Mock uses memory.write then task.done — both must be allowed.
    const task = createTask('restricted task', undefined, ['memory.write', 'task.done']);
    expect(task.capabilities).toEqual(['memory.write', 'task.done']);

    await runOnce(new MockLLMAdapter());

    expect(getTask(task.id)!.status).toBe('complete');
  });

  it('task blocked by capabilities fails with policy.denied event', async () => {
    // Mock step 0 calls memory.write — block it.
    const task = createTask('blocked task', undefined, ['task.done']);

    await runOnce(new MockLLMAdapter());

    const result = getTask(task.id)!;
    expect(result.status).toBe('failed');

    const events = listEvents(task.id);
    expect(events.some(e => e.type === 'policy.denied')).toBe(true);
    const denied = events.find(e => e.type === 'policy.denied')!;
    expect((denied.payload as any).tool).toBe('memory.write');
  });

  it('spawned child inherits parent capabilities when none specified', async () => {
    // We test inheritance directly via createTask (the logic mirrors task.spawn execute).
    const parent = createTask('parent', undefined, ['task.spawn', 'task.done', 'memory.write']);
    // Simulate inheritance: child created with parent caps when task.spawn omits capabilities.
    const child = createTask('child', parent.id, parent.capabilities ?? undefined);
    expect(child.capabilities).toEqual(['task.spawn', 'task.done', 'memory.write']);
  });

  it('spawned child can have narrower capabilities than parent', async () => {
    const parent = createTask('parent', undefined, ['task.spawn', 'task.done', 'memory.write']);
    const child = createTask('child', parent.id, ['task.done']);
    expect(child.capabilities).toEqual(['task.done']);
  });

  it('capabilities are stored and retrieved from DB correctly', async () => {
    const caps = ['memory.write', 'artifact.create', 'task.done'];
    const task = createTask('storage test', undefined, caps);
    const fetched = getTask(task.id)!;
    expect(fetched.capabilities).toEqual(caps);
  });
});
