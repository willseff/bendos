import { z } from 'zod';
import { registerTool } from '../registry';
import { receiveMessages } from '../../objects/message';

registerTool({
  name: 'message.receive',
  description: 'Read unread messages from this task\'s inbox. Messages are marked read by default.',
  inputSchema: z.object({
    peek: z.boolean().optional().describe('If true, return messages without marking them read'),
  }),
  async execute(input, ctx) {
    const messages = receiveMessages(ctx.taskId, !input.peek);
    return messages.map(m => ({
      id: m.id,
      from: m.from_task_id,
      type: m.type,
      payload: m.payload,
    }));
  },
});
