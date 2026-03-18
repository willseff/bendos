import { z } from 'zod';
import { registerTool } from '../registry';
import { createTask, incrementSpawnCount } from '../../objects/task';
import { emitEvent } from '../../objects/event';

registerTool({
  name: 'task.spawn',
  description: 'Spawn a new child task with a given goal. Optionally restrict which tools the child can use via capabilities (array of tool names). If omitted, the child inherits the parent\'s capabilities.',
  inputSchema: z.object({
    goal: z.string().min(1),
    capabilities: z.array(z.string()).optional(),
  }),
  async execute(input, ctx) {
    // Inherit parent capabilities if not explicitly provided.
    const caps = input.capabilities !== undefined
      ? input.capabilities
      : ctx.task.capabilities ?? undefined;
    const child = createTask(input.goal, ctx.taskId, caps);
    incrementSpawnCount(ctx.taskId);
    emitEvent('task.spawned', { childTaskId: child.id, goal: input.goal, capabilities: child.capabilities }, ctx.taskId);
    return { id: child.id, goal: child.goal, capabilities: child.capabilities };
  },
});
