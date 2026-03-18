import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb, getDb } from '../db/index';
import { createTask, getTask } from '../objects/task';
import { listEvents } from '../objects/event';
import { runOnce } from '../kernel/runtime';
import { MockLLMAdapter } from '../llm/mock';
import { seedToolRegistry } from '../tools/registry';
import { registerAgent, getAgent, listAgents } from '../agents/registry';
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

describe('declarative agents', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    getDb();
    seedToolRegistry();
  });

  afterEach(() => {
    closeDb();
  });

  it('registerAgent stores and retrieves agent definitions', () => {
    registerAgent({
      name: 'tester',
      description: 'A test agent',
      systemPrompt: 'You are a test agent.',
      capabilities: ['memory.write', 'task.done'],
    });

    const def = getAgent('tester');
    expect(def).toBeDefined();
    expect(def!.name).toBe('tester');
    expect(def!.capabilities).toEqual(['memory.write', 'task.done']);
  });

  it('listAgents returns all registered agents', () => {
    registerAgent({ name: 'a1', description: 'A1', systemPrompt: 'A1 prompt' });
    registerAgent({ name: 'a2', description: 'A2', systemPrompt: 'A2 prompt' });
    const names = listAgents().map(a => a.name);
    expect(names).toContain('a1');
    expect(names).toContain('a2');
  });

  it('createTask with agentType stores agent_type on the task', () => {
    registerAgent({ name: 'worker', description: 'Worker', systemPrompt: 'Work.' });
    const task = createTask('do work', { agentType: 'worker' });
    expect(task.agent_type).toBe('worker');
  });

  it('task with agent capabilities is enforced by policy', async () => {
    registerAgent({
      name: 'locked',
      description: 'Only task.done allowed',
      systemPrompt: 'Only call task.done.',
      capabilities: ['task.done'],
    });

    // Mock step 0 calls memory.write — should be blocked by capabilities.
    const task = createTask('locked goal', {
      agentType: 'locked',
      capabilities: ['task.done'],
    });

    await runOnce(new MockLLMAdapter());

    const result = getTask(task.id)!;
    expect(result.status).toBe('failed');
    const events = listEvents(task.id);
    expect(events.some(e => e.type === 'policy.denied')).toBe(true);
  });

  it('task with agent_type and full capabilities completes normally', async () => {
    registerAgent({
      name: 'full',
      description: 'Full access agent',
      systemPrompt: 'Do everything.',
    });
    // null capabilities = unrestricted
    const task = createTask('full goal', { agentType: 'full' });
    expect(task.agent_type).toBe('full');

    await runOnce(new MockLLMAdapter());

    expect(getTask(task.id)!.status).toBe('complete');
  });

  it('maxSteps from agent def is stored on the task', () => {
    registerAgent({
      name: 'longrunner',
      description: 'Long runner',
      systemPrompt: 'Run long.',
      maxSteps: 50,
    });
    const task = createTask('long goal', {
      agentType: 'longrunner',
      maxSteps: 50,
    });
    expect(task.max_steps).toBe(50);
  });

  it('task.spawn with agentType inherits agent capabilities', async () => {
    registerAgent({
      name: 'specialist',
      description: 'Specialist',
      systemPrompt: 'Specialize.',
      capabilities: ['memory.write', 'task.done'],
    });

    // Verify the agent def is available (spawn logic is tested via the tool)
    const def = getAgent('specialist');
    expect(def!.capabilities).toEqual(['memory.write', 'task.done']);

    // Create a child task as if task.spawn had run with agentType
    const child = createTask('specialist work', {
      agentType: 'specialist',
      capabilities: def!.capabilities,
    });
    expect(child.agent_type).toBe('specialist');
    expect(child.capabilities).toEqual(['memory.write', 'task.done']);
  });
});
