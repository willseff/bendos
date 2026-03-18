import { z } from 'zod';
import { registerTool } from '../registry';
import { createTask, incrementSpawnCount } from '../../objects/task';
import { emitEvent } from '../../objects/event';

registerTool({
  name: 'task.spawn',
  description: 'Spawn a new child task with a given goal.',
  inputSchema: z.object({
    goal: z.string().min(1),
  }),
  async execute(input, ctx) {
    const child = createTask(input.goal, ctx.taskId);
    incrementSpawnCount(ctx.taskId);
    emitEvent('task.spawned', { childTaskId: child.id, goal: input.goal }, ctx.taskId);
    return { id: child.id, goal: child.goal };
  },
});
