import { z } from 'zod';
import { registerTool } from '../registry';
import { createTask, incrementSpawnCount } from '../../objects/task';
import { emitEvent } from '../../objects/event';
import { getAgent } from '../../agents/registry';

registerTool({
  name: 'task.spawn',
  description: 'Spawn a new child task. Provide agentType to instantiate a named agent definition (its systemPrompt and capabilities are applied automatically). Optionally override capabilities. If neither agentType nor capabilities are provided, capabilities are inherited from the parent.',
  inputSchema: z.object({
    goal: z.string().min(1),
    agentType: z.string().optional(),
    capabilities: z.array(z.string()).optional(),
    priority: z.number().int().optional(),
  }),
  async execute(input, ctx) {
    const agentDef = input.agentType ? getAgent(input.agentType) : undefined;

    if (input.agentType && !agentDef) {
      throw new Error(`Unknown agent type: "${input.agentType}"`);
    }

    // Capabilities priority: explicit input > agent def > inherit from parent.
    const caps = input.capabilities !== undefined
      ? input.capabilities
      : agentDef?.capabilities ?? ctx.task.capabilities ?? undefined;

    const child = createTask(input.goal, {
      parentTaskId: ctx.taskId,
      capabilities: caps,
      agentType: input.agentType,
      maxSteps: agentDef?.maxSteps,
      priority: input.priority ?? 0,
    });

    incrementSpawnCount(ctx.taskId);
    emitEvent('task.spawned', { childTaskId: child.id, goal: input.goal, agentType: child.agent_type, capabilities: child.capabilities }, ctx.taskId);
    return { id: child.id, goal: child.goal, agentType: child.agent_type, capabilities: child.capabilities };
  },
});
