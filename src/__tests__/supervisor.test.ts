import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb, getDb } from '../db/index';
import { createTask, getTask, listTasks } from '../objects/task';
import { runOnce } from '../kernel/runtime';
import { MockLLMAdapter } from '../llm/mock';
import { seedToolRegistry } from '../tools/registry';
import { registerAgent } from '../agents/registry';
import { applyBootConfig } from '../boot/index';
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

// Simulate the daemon's supervisor check inline (same logic as daemon/index.ts).
import { getAgent } from '../agents/registry';

async function runOnceWithSupervisor(adapter: MockLLMAdapter) {
  const result = await runOnce(adapter);
  if (result.taskId) {
    const task = getTask(result.taskId)!;
    if (task.agent_type) {
      const def = getAgent(task.agent_type);
      const shouldRestart = def && (
        def.restart === 'always' ||
        (def.restart === 'on-failure' && task.status === 'failed')
      );
      if (shouldRestart) {
        createTask(task.goal, {
          agentType: task.agent_type,
          capabilities: task.capabilities ?? undefined,
          priority: task.priority,
        });
      }
    }
  }
  return result;
}

describe('supervisor', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    getDb();
    seedToolRegistry();
  });

  afterEach(() => {
    closeDb();
  });

  it('restart=never (default) does not respawn on completion', async () => {
    registerAgent({ name: 'one-shot', description: '', systemPrompt: '', restart: 'never' });
    createTask('do once', { agentType: 'one-shot' });

    await runOnceWithSupervisor(new MockLLMAdapter());

    const all = listTasks();
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe('complete');
  });

  it('restart=always respawns after completion', async () => {
    registerAgent({ name: 'immortal', description: '', systemPrompt: '', restart: 'always' });
    createTask('run forever', { agentType: 'immortal' });

    await runOnceWithSupervisor(new MockLLMAdapter());

    const all = listTasks();
    expect(all).toHaveLength(2);
    expect(all[0].status).toBe('complete');
    expect(all[1].status).toBe('pending');
    expect(all[1].agent_type).toBe('immortal');
    expect(all[1].goal).toBe('run forever');
  });

  it('restart=on-failure respawns when task fails', async () => {
    registerAgent({ name: 'resilient', description: '', systemPrompt: '', restart: 'on-failure' });
    // Capabilities that block step 0 → fails
    createTask('risky work', { agentType: 'resilient', capabilities: ['task.done'] });

    await runOnceWithSupervisor(new MockLLMAdapter());

    const all = listTasks();
    expect(all[0].status).toBe('failed');
    expect(all).toHaveLength(2);
    expect(all[1].status).toBe('pending');
    expect(all[1].agent_type).toBe('resilient');
  });

  it('restart=on-failure does NOT respawn on successful completion', async () => {
    registerAgent({ name: 'cautious', description: '', systemPrompt: '', restart: 'on-failure' });
    createTask('complete successfully', { agentType: 'cautious' });

    await runOnceWithSupervisor(new MockLLMAdapter());

    const all = listTasks();
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe('complete');
  });
});

describe('boot config', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    getDb();
    seedToolRegistry();
  });

  afterEach(() => {
    closeDb();
  });

  it('applyBootConfig spawns tasks for each entry', () => {
    registerAgent({ name: 'worker', description: '', systemPrompt: '' });
    applyBootConfig([{ agentType: 'worker', goal: 'do work' }]);

    const tasks = listTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].agent_type).toBe('worker');
    expect(tasks[0].goal).toBe('do work');
  });

  it('applyBootConfig is idempotent — skips if live task already exists', () => {
    registerAgent({ name: 'singleton', description: '', systemPrompt: '' });
    applyBootConfig([{ agentType: 'singleton', goal: 'run once' }]);
    applyBootConfig([{ agentType: 'singleton', goal: 'run once' }]);

    expect(listTasks()).toHaveLength(1);
  });

  it('applyBootConfig spawns again after the previous instance completes', async () => {
    registerAgent({ name: 'cycler', description: '', systemPrompt: '' });
    applyBootConfig([{ agentType: 'cycler', goal: 'cycle' }]);

    await runOnce(new MockLLMAdapter());
    expect(listTasks()[0].status).toBe('complete');

    // Simulate daemon restart — applyBootConfig runs again
    applyBootConfig([{ agentType: 'cycler', goal: 'cycle' }]);

    const all = listTasks();
    expect(all).toHaveLength(2);
    expect(all[1].status).toBe('pending');
  });

  it('applyBootConfig warns and skips unknown agent types', () => {
    // Should not throw, just skip
    expect(() => applyBootConfig([{ agentType: 'does-not-exist', goal: 'ghost work' }])).not.toThrow();
    expect(listTasks()).toHaveLength(0);
  });
});
