import '../tools/builtin/task.spawn';
import '../tools/builtin/task.done';
import '../tools/builtin/task.pipe';
import '../tools/builtin/task.wait';
import '../tools/builtin/fs.read';
import '../tools/builtin/fs.ls';
import '../tools/builtin/fs.stat';
import '../vfs/init';
import '../tools/builtin/memory.read';
import '../tools/builtin/memory.write';
import '../tools/builtin/artifact.create';
import '../tools/builtin/artifact.read';
import '../tools/builtin/artifact.list';
import '../tools/builtin/state.query';
import '../tools/builtin/message.send';
import '../tools/builtin/message.receive';

import { getDb } from '../db/index';
import { seedToolRegistry } from '../tools/registry';
import { loadExternalTools } from '../tools/loader';
import { runOnce } from '../kernel/runtime';
import { getNextTask, processResumeSignals } from '../kernel/scheduler';
import { getTask, createTask } from '../objects/task';
import { MockLLMAdapter } from '../llm/mock';
import { OpenAIAdapter } from '../llm/openai';
import { AnthropicAdapter } from '../llm/anthropic';
import type { LLMAdapter } from '../llm/index';
import { writePid, clearPid, daemonStatus } from './pid';
import { loadAgents } from '../agents/loader';
import { getAgent } from '../agents/registry';
import { loadBootConfig, applyBootConfig } from '../boot/index';
import { CronScheduler, fireDueCronEntries } from '../boot/cron';
import { startApiServer } from '../api/index';

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

export async function startDaemon(apiPort?: number): Promise<void> {
  const status = daemonStatus();
  if (status.running) {
    console.error(`Daemon already running (pid ${status.pid}). Stop it first with: bendos daemon:stop`);
    process.exit(1);
  }

  getDb();
  loadExternalTools(process.env.TOOLS_DIR ?? './tools');
  seedToolRegistry();
  loadAgents(process.env.AGENTS_DIR ?? './agents');

  const port = apiPort ?? parseInt(process.env.API_PORT ?? '4000', 10);
  const apiServer = startApiServer(port);

  const bootEntries = loadBootConfig(process.env.BOOT_CONFIG ?? './boot.json');
  const cronScheduler = new CronScheduler();
  cronScheduler.init(bootEntries);
  applyBootConfig(bootEntries.filter(e => !e.cron));  // one-time entries only
  if (bootEntries.length > 0) {
    const cronCount = bootEntries.filter(e => e.cron).length;
    const onceCount = bootEntries.filter(e => !e.cron).length;
    log(`boot: ${onceCount} one-time entr${onceCount === 1 ? 'y' : 'ies'}, ${cronCount} cron schedule${cronCount === 1 ? '' : 's'}`);
  }

  const adapter = getAdapter();
  writePid(process.pid);

  let shuttingDown = false;
  let sleepTimer: NodeJS.Timeout | null = null;

  const shutdown = (signal: string) => {
    log(`${signal} received — finishing current task then stopping...`);
    shuttingDown = true;
    if (sleepTimer) { clearTimeout(sleepTimer); sleepTimer = null; }
    apiServer.close();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  log(`daemon started  pid=${process.pid}  adapter=${adapter.name}  poll=${POLL_INTERVAL}ms`);

  let idle = false;

  try {
    while (!shuttingDown) {
      processResumeSignals();
      fireDueCronEntries(cronScheduler, bootEntries);
      const next = getNextTask();

      if (next) {
        idle = false;
        log(`→ ${next.id.slice(0, 8)}  "${next.goal}"`);

        const result = await runOnce(adapter);

        if (result.taskId) {
          const task = getTask(result.taskId)!;
          log(`✓ ${task.id.slice(0, 8)}  [${task.status}]  ${task.step_count} steps`);

          // Supervisor: restart if agent def has a restart policy.
          if (task.agent_type) {
            const def = getAgent(task.agent_type);
            const shouldRestart = def && (
              def.restart === 'always' ||
              (def.restart === 'on-failure' && task.status === 'failed')
            );
            if (shouldRestart) {
              const restarted = createTask(task.goal, {
                agentType: task.agent_type,
                capabilities: task.capabilities ?? undefined,
                priority: task.priority,
                jobId: task.job_id ?? undefined,
                maxSteps: task.max_steps ?? undefined,
              });
              log(`↻ restarting ${task.agent_type} → ${restarted.id.slice(0, 8)}`);
            }
          }
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
