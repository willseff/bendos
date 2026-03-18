import '../tools/builtin/task.spawn';
import '../tools/builtin/task.done';
import '../tools/builtin/memory.read';
import '../tools/builtin/memory.write';
import '../tools/builtin/artifact.create';
import '../tools/builtin/state.query';
import '../tools/builtin/message.send';
import '../tools/builtin/message.receive';

import { Command } from 'commander';
import { getDb } from '../db/index';
import { seedToolRegistry } from '../tools/registry';
import { loadExternalTools } from '../tools/loader';
import { createTask, listTasks, getTask } from '../objects/task';
import { listToolRecords } from '../objects/tool';
import { listArtifacts } from '../objects/artifact';
import { queryMemories } from '../objects/memory';
import { listEvents } from '../objects/event';
import { listMessages } from '../objects/message';
import { runOnce, runAll } from '../kernel/runtime';
import type { LLMAdapter } from '../llm/index';
import { MockLLMAdapter } from '../llm/mock';
import { OpenAIAdapter } from '../llm/openai';
import { AnthropicAdapter } from '../llm/anthropic';

function getAdapter(): LLMAdapter {
  const provider = process.env.LLM_PROVIDER ?? 'mock';

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY ?? '';
    return new OpenAIAdapter(apiKey);
  }

  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
    return new AnthropicAdapter(apiKey);
  }

  return new MockLLMAdapter();
}

export function buildCli(): Command {
  const program = new Command();

  program
    .name('bendos')
    .description('A headless operating environment for LLM agents')
    .version('0.1.0');

  const toolsDir = process.env.TOOLS_DIR ?? './tools';

  program
    .command('init')
    .description('Initialize the database and seed the tool registry')
    .action(() => {
      getDb();
      loadExternalTools(toolsDir);
      seedToolRegistry();
      console.log('bendos initialized. Database ready and tools registered.');
    });

  program
    .command('run')
    .description('Run all pending tasks to completion')
    .action(async () => {
      getDb();
      loadExternalTools(toolsDir);
      seedToolRegistry();
      const adapter = getAdapter();
      console.log(`Running all tasks with adapter: ${adapter.name}`);
      await runAll(adapter);
      console.log('All tasks complete.');
    });

  program
    .command('run:once')
    .description('Run a single pending task')
    .action(async () => {
      getDb();
      seedToolRegistry();
      const adapter = getAdapter();
      const result = await runOnce(adapter);
      if (result.ran) {
        console.log(`Task ran: ${result.taskId}`);
      } else {
        console.log('No pending tasks.');
      }
    });

  program
    .command('task:create <goal>')
    .description('Create a new task with the given goal')
    .action((goal: string) => {
      getDb();
      const task = createTask(goal);
      console.log(`Created task: ${task.id}`);
    });

  program
    .command('task:list')
    .description('List all tasks')
    .action(() => {
      getDb();
      const tasks = listTasks();
      const header = `${'ID'.padEnd(38)}  ${'STATUS'.padEnd(10)}  ${'STEPS'.padEnd(6)}  GOAL`;
      console.log(header);
      console.log('-'.repeat(header.length + 10));
      for (const task of tasks) {
        const parent = task.parent_task_id ? ` (child of ${task.parent_task_id})` : '';
        console.log(
          `${task.id.padEnd(38)}  ${task.status.padEnd(10)}  ${String(task.step_count).padEnd(6)}  ${task.goal}${parent}`
        );
      }
    });

  program
    .command('object:list')
    .description('Show counts of all objects in the system')
    .action(() => {
      getDb();
      const tasks = listTasks();
      const tools = listToolRecords();
      const artifacts = listArtifacts();
      const memories = queryMemories();

      console.log('Object counts:');
      console.log(`  tasks:     ${tasks.length}`);
      console.log(`  tools:     ${tools.length}`);
      console.log(`  artifacts: ${artifacts.length}`);
      console.log(`  memories:  ${memories.length}`);
    });

  program
    .command('trace <taskId>')
    .description('Show the full event trace for a task')
    .action((taskId: string) => {
      getDb();
      const events = listEvents(taskId);
      console.log(`Trace for task: ${taskId}`);
      console.log('-'.repeat(60));
      for (const event of events) {
        if (event.type === 'action.executed') {
          const p = event.payload as { step: number; tool: string; thought: string };
          console.log(`  step ${p.step}: ${p.tool} — ${p.thought}`);
        } else {
          console.log(`  [${event.type}] ${JSON.stringify(event.payload)}`);
        }
      }
    });

  program
    .command('message:list <taskId>')
    .description('Show messages sent to and from a task')
    .action((taskId: string) => {
      getDb();
      const task = getTask(taskId);
      if (!task) { console.error(`Task not found: ${taskId}`); process.exit(1); }
      const messages = listMessages(taskId);
      if (messages.length === 0) { console.log('No messages.'); return; }
      for (const m of messages) {
        const dir = m.to_task_id === taskId ? '←' : '→';
        const other = (m.to_task_id === taskId ? m.from_task_id : m.to_task_id).slice(0, 8);
        console.log(`${dir} ${other}...  [${m.status}]  ${m.type}  ${JSON.stringify(m.payload)}`);
      }
    });

  return program;
}
