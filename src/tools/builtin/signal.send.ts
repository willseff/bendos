import { z } from 'zod';
import { registerTool } from '../registry';
import { sendSignal } from '../../objects/signal';
import { emitEvent } from '../../objects/event';

registerTool({
  name: 'signal.send',
  description: 'Send a control signal to a task you are supervising. cancel: stop it immediately. pause/resume: throttle work. inject: push a data payload into its inbox while it is running. Only use on tasks you spawned or are responsible for.',
  inputSchema: z.object({
    to: z.string().min(1).describe('Target task ID'),
    type: z.enum(['cancel', 'pause', 'resume', 'inject']).describe('Signal type'),
    payload: z.record(z.unknown()).optional().describe('Payload (required for inject)'),
  }),
  async execute(input, ctx) {
    const signal = sendSignal(input.to, input.type, input.payload ?? {});
    emitEvent('signal.sent', { to: input.to, type: input.type, signalId: signal.id }, ctx.taskId);
    return { signalId: signal.id };
  },
});
