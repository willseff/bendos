import type { LLMAdapter, LLMContext, AgentAction } from './index';

export class MockLLMAdapter implements LLMAdapter {
  name = 'mock';

  async complete(context: LLMContext): Promise<AgentAction> {
    const executedCount = context.events.filter(e => e.type === 'action.executed').length;
    const step = executedCount % 2;

    if (step === 0) {
      return {
        thought: 'I should start by writing a memory about the goal.',
        tool: 'memory.write',
        input: {
          content: `Working on goal: ${context.goal}`,
          tags: ['goal'],
        },
      };
    }

    return {
      thought: 'I have completed the task.',
      tool: 'task.done',
      input: {
        summary: `Completed: ${context.goal}`,
      },
    };
  }
}
