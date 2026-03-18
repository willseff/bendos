import '../tools/builtin/task.spawn';
import '../tools/builtin/task.done';
import '../tools/builtin/task.pipe';
import '../tools/builtin/memory.read';
import '../tools/builtin/memory.write';
import '../tools/builtin/artifact.create';
import '../tools/builtin/state.query';
import '../tools/builtin/message.send';
import '../tools/builtin/message.receive';

import { getDb } from '../db/index';
import { seedToolRegistry } from '../tools/registry';
import { loadExternalTools } from '../tools/loader';
import { runOnce } from '../kernel/runtime';
import { getNextTask } from '../kernel/scheduler';
import { getTask } from '../objects/task';
import { MockLLMAdapter } from '../llm/mock';
import { OpenAIAdapter } from '../llm/openai';
import { AnthropicAdapter } from '../llm/anthropic';
import type { LLMAdapter } from '../llm/index';
import { writePid, clearPid, daemonStatus } from './pid';

const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS ?? '2000', 10);

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function getAdapter(): LLMAdapter {
  const provider = process.env.LLM_PROVIDER ?? 'mock';
  if (provider === 'openai')    return new OpenAIAdapter(process.env.OPENAI_API_KEY ?? '');
  if (provider === 'anthropic') return new AnthropicAdapter(process.env.ANTHROPIC_API_KEY ?? '');
  return new MockLLMAdapter();
}

export async function startDaemon(): Promise<void> {
  const status = daemonStatus();
  if (status.running) {
    console.error(`Daemon already running (pid ${status.pid}). Stop it first with: bendos daemon:stop`);
    process.exit(1);
  }

  getDb();
  loadExternalTools(process.env.TOOLS_DIR ?? './tools');
  seedToolRegistry();

  const adapter = getAdapter();
  writePid(process.pid);

  let shuttingDown = false;
  let sleepTimer: NodeJS.Timeout | null = null;

  const shutdown = (signal: string) => {
    log(`${signal} received — finishing current task then stopping...`);
    shuttingDown = true;
    if (sleepTimer) { clearTimeout(sleepTimer); sleepTimer = null; }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  log(`daemon started  pid=${process.pid}  adapter=${adapter.name}  poll=${POLL_INTERVAL}ms`);

  let idle = false;

  try {
    while (!shuttingDown) {
      const next = getNextTask();

      if (next) {
        idle = false;
        log(`→ ${next.id.slice(0, 8)}  "${next.goal}"`);

        const result = await runOnce(adapter);

        if (result.taskId) {
          const task = getTask(result.taskId)!;
          log(`✓ ${task.id.slice(0, 8)}  [${task.status}]  ${task.step_count} steps`);
        }
      } else {
        if (!idle) {
          log(`idle — polling every ${POLL_INTERVAL}ms`);
          idle = true;
        }
        await new Promise<void>(resolve => {
          sleepTimer = setTimeout(resolve, POLL_INTERVAL);
        });
        sleepTimer = null;
      }
    }
  } finally {
    clearPid();
    log('daemon stopped');
  }
}
