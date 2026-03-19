import { z } from 'zod';
import { registerTool } from '../registry';
import { listTasks, TaskStatus } from '../../objects/task';
import { listEvents } from '../../objects/event';

registerTool({
  name: 'state.query',
  description: 'Query system state. Use type="tasks" to find other tasks by status (e.g. pending, running, complete) — useful for coordinators checking on workers. Use type="events" to review your own recent event history beyond what is shown in context.',
  inputSchema: z.object({
    type: z.enum(['tasks', 'events']),
    status: z.string().optional(),
    limit: z.number().optional(),
  }),
  async execute(input, ctx) {
    const limit = input.limit ?? 10;

    if (input.type === 'tasks') {
      const status = input.status ? TaskStatus.parse(input.status) : undefined;
      return listTasks(status).slice(0, limit);
    }

    if (input.type === 'events') {
      return listEvents(ctx.taskId, limit);
    }

    return [];
  },
});
