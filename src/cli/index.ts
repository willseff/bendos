import '../tools/builtin/task.spawn';
import '../tools/builtin/task.done';
import '../tools/builtin/memory.read';
import '../tools/builtin/memory.write';
import '../tools/builtin/artifact.create';
import '../tools/builtin/state.query';

import { Command } from 'commander';
import { getDb } from '../db/index';
import { seedToolRegistry } from '../tools/registry';
import { createTask, listTasks } from '../objects/task';
import { listToolRecords } from '../objects/tool';
import { listArtifacts } from '../objects/artifact';
import { queryMemories } from '../objects/memory';
import { listEvents } from '../objects/event';
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

  program
    .command('init')
    .description('Initialize the database and seed the tool registry')
    .action(() => {
      getDb();
      seedToolRegistry();
      console.log('bendos initialized. Database ready and tools registered.');
    });

  program
    .command('run')
    .description('Run all pending tasks to completion')
    .action(async () => {
      getDb();
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

  return program;
}
