import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb, getDb } from '../db/index';
import { createTask } from '../objects/task';
import { sendMessage, receiveMessages, countUnread } from '../objects/message';
import { assembleContext } from '../context/assembler';
import { seedToolRegistry } from '../tools/registry';
import '../tools/builtin/task.spawn';
import '../tools/builtin/task.done';
import '../tools/builtin/memory.read';
import '../tools/builtin/memory.write';
import '../tools/builtin/artifact.create';
import '../tools/builtin/artifact.read';
import '../tools/builtin/artifact.list';
import '../tools/builtin/state.query';
import '../tools/builtin/message.send';
import '../tools/builtin/message.receive';

describe('IPC', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    getDb();
    seedToolRegistry();
  });

  afterEach(() => {
    closeDb();
  });

  it('sends a message and receiver can read it', () => {
    const sender = createTask('send a greeting');
    const receiver = createTask('wait for messages');

    sendMessage(sender.id, receiver.id, 'greeting', { text: 'hello' });

    expect(countUnread(receiver.id)).toBe(1);
    expect(countUnread(sender.id)).toBe(0);

    const messages = receiveMessages(receiver.id, false); // peek
    expect(messages.length).toBe(1);
    expect(messages[0].type).toBe('greeting');
    expect(messages[0].payload).toEqual({ text: 'hello' });
    expect(messages[0].from_task_id).toBe(sender.id);
  });

  it('marks messages as read after receiveMessages', () => {
    const sender = createTask('sender');
    const receiver = createTask('receiver');

    sendMessage(sender.id, receiver.id, 'ping', {});
    expect(countUnread(receiver.id)).toBe(1);

    receiveMessages(receiver.id, true); // mark read
    expect(countUnread(receiver.id)).toBe(0);
  });

  it('includes inbox in assembled context', () => {
    const sender = createTask('sender');
    const receiver = createTask('receiver');

    sendMessage(sender.id, receiver.id, 'request', { data: 42 });

    const ctx = assembleContext(receiver);
    expect(ctx.inbox.length).toBe(1);
    expect(ctx.inbox[0].type).toBe('request');
    expect(ctx.inbox[0].from).toBe(sender.id);
    expect((ctx.inbox[0].payload as { data: number }).data).toBe(42);
  });

  it('inbox is empty when no unread messages', () => {
    const task = createTask('lonely task');
    const ctx = assembleContext(task);
    expect(ctx.inbox).toEqual([]);
  });
});
