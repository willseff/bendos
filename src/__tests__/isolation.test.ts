import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb, getDb } from '../db/index';
import { createTask } from '../objects/task';
import { writeMemory, readMemory, queryMemories } from '../objects/memory';
import { createArtifact, listArtifacts } from '../objects/artifact';
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

describe('isolation', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    getDb();
    seedToolRegistry();
  });

  afterEach(() => {
    closeDb();
  });

  describe('memory', () => {
    it('private memory is not visible to another task', () => {
      const taskA = createTask('task a');
      const taskB = createTask('task b');

      writeMemory('secret', taskA.id, [], 'private');

      // task B cannot read it by ID
      expect(readMemory(taskA.id, taskB.id)).toBeNull();

      // task B's query does not include it
      const bMemories = queryMemories(taskB.id);
      expect(bMemories.some(m => m.content === 'secret')).toBe(false);
    });

    it('public memory is visible to all tasks', () => {
      const taskA = createTask('task a');
      const taskB = createTask('task b');

      const m = writeMemory('shared knowledge', taskA.id, [], 'public');

      // task B can read it by ID
      expect(readMemory(m.id, taskB.id)).not.toBeNull();

      // task B's query includes it
      const bMemories = queryMemories(taskB.id);
      expect(bMemories.some(mem => mem.content === 'shared knowledge')).toBe(true);
    });

    it('a task always sees its own private memories', () => {
      const task = createTask('task');
      writeMemory('my note', task.id, [], 'private');

      const memories = queryMemories(task.id);
      expect(memories.some(m => m.content === 'my note')).toBe(true);
      expect(readMemory(memories[0].id, task.id)).not.toBeNull();
    });

    it('context assembler only surfaces own + public memories', () => {
      const taskA = createTask('task a');
      const taskB = createTask('task b');

      writeMemory('a private', taskA.id, [], 'private');
      writeMemory('a public', taskA.id, [], 'public');
      writeMemory('b private', taskB.id, [], 'private');

      const ctxB = assembleContext(taskB);
      const contents = ctxB.memories.map(m => m.content);

      expect(contents).toContain('a public');   // public from A is visible
      expect(contents).toContain('b private');  // B's own private is visible
      expect(contents).not.toContain('a private'); // A's private is NOT visible
    });
  });

  describe('artifacts', () => {
    it('private artifact is not visible to another task', () => {
      const taskA = createTask('task a');
      const taskB = createTask('task b');

      createArtifact('secret.txt', 'classified', taskA.id, 'text/plain', 'private');

      const bArtifacts = listArtifacts(taskB.id);
      expect(bArtifacts.some(a => a.name === 'secret.txt')).toBe(false);
    });

    it('public artifact is visible to all tasks', () => {
      const taskA = createTask('task a');
      const taskB = createTask('task b');

      createArtifact('shared.txt', 'open', taskA.id, 'text/plain', 'public');

      const bArtifacts = listArtifacts(taskB.id);
      expect(bArtifacts.some(a => a.name === 'shared.txt')).toBe(true);
    });
  });
});
