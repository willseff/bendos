import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb, getDb } from '../db/index';
import { createTask } from '../objects/task';
import { registerAgent } from '../agents/registry';
import { sendMessage } from '../objects/message';
import { assembleContext } from '../context/assembler';

describe('context assembler — system prompt', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    getDb();
  });

  afterEach(() => {
    closeDb();
  });

  it('includes task ID and goal', () => {
    const task = createTask('write a report');
    const ctx = assembleContext(task);
    expect(ctx.systemPrompt).toContain(task.id);
    expect(ctx.systemPrompt).toContain('write a report');
  });

  it('includes short task ID (8 chars)', () => {
    const task = createTask('hello');
    const ctx = assembleContext(task);
    expect(ctx.systemPrompt).toContain(task.id.slice(0, 8));
  });

  it('exposes /proc/self path in system prompt', () => {
    const task = createTask('navigate');
    const ctx = assembleContext(task);
    expect(ctx.systemPrompt).toContain('/proc/self');
  });

  it('mentions task.wait / inbox when coordinating', () => {
    const task = createTask('coordinate');
    const ctx = assembleContext(task);
    expect(ctx.systemPrompt).toContain('task.wait');
    expect(ctx.systemPrompt).toContain('inbox');
  });

  it('includes agent instructions when agent_type is set', () => {
    registerAgent({ name: 'researcher', description: 'd', systemPrompt: 'Search the web thoroughly.' });
    const task = createTask('do research', { agentType: 'researcher' });
    const ctx = assembleContext(task);
    expect(ctx.systemPrompt).toContain('Search the web thoroughly.');
  });

  it('mentions capabilities restriction when capabilities are set', () => {
    const task = createTask('limited task', { capabilities: ['task.done', 'memory.write'] });
    const ctx = assembleContext(task);
    expect(ctx.systemPrompt).toContain('restricted');
    expect(ctx.systemPrompt).toContain('task.done');
    expect(ctx.systemPrompt).toContain('memory.write');
  });

  it('shows unread message count when inbox has messages', () => {
    const sender = createTask('sender');
    const receiver = createTask('receiver');
    sendMessage(sender.id, receiver.id, 'ping', {});
    const ctx = assembleContext(receiver);
    expect(ctx.systemPrompt).toContain('1 unread');
  });

  it('sets taskId field on context', () => {
    const task = createTask('check taskId');
    const ctx = assembleContext(task);
    expect(ctx.taskId).toBe(task.id);
  });

  it('includes parent and job in prompt when present', () => {
    const parent = createTask('parent');
    const child = createTask('child', { parentTaskId: parent.id, jobId: 'batch-7' });
    const ctx = assembleContext(child);
    expect(ctx.systemPrompt).toContain(parent.id.slice(0, 8));
    expect(ctx.systemPrompt).toContain('batch-7');
  });
});
