import { z } from 'zod';
import { registerTool } from '../registry';
import { sendMessage } from '../../objects/message';
import { emitEvent } from '../../objects/event';

registerTool({
  name: 'message.send',
  description: 'Send a structured message to another task\'s inbox.',
  inputSchema: z.object({
    to: z.string().min(1).describe('Target task ID'),
    type: z.string().min(1).describe('Message type (e.g. "request", "result", "signal")'),
    payload: z.record(z.unknown()).optional().describe('Message payload'),
  }),
  async execute(input, ctx) {
    const message = sendMessage(ctx.taskId, input.to, input.type, input.payload ?? {});
    emitEvent('message.sent', { to: input.to, type: input.type, messageId: message.id }, ctx.taskId);
    return { messageId: message.id };
  },
});
