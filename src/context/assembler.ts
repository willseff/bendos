import type { Task } from '../objects/task';
import { listEvents } from '../objects/event';
import { queryMemories } from '../objects/memory';
import { listRegisteredTools } from '../tools/registry';
import type { LLMContext } from '../llm/index';

export function assembleContext(task: Task, previousNote?: string): LLMContext {
  const events = listEvents(task.id, 10);
  const memories = queryMemories(task.id);
  const tools = listRegisteredTools();

  return {
    goal: task.goal,
    events: events.map(e => ({
      type: e.type,
      payload: e.payload,
      created_at: e.created_at,
    })),
    memories: memories.map(m => ({
      id: m.id,
      content: m.content,
      tags: m.tags,
    })),
    tools,
    note: previousNote,
  };
}
