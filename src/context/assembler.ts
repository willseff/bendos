import type { Task } from '../objects/task';
import { listEvents } from '../objects/event';
import { queryMemories } from '../objects/memory';
import { receiveMessages } from '../objects/message';
import { listRegisteredTools } from '../tools/registry';
import type { LLMContext } from '../llm/index';

export function assembleContext(task: Task, previousNote?: string): LLMContext {
  const events = listEvents(task.id, 10);
  const memories = queryMemories(task.id);
  const tools = listRegisteredTools();
  // Peek at inbox without marking read — the message.receive tool marks them read explicitly.
  const unread = receiveMessages(task.id, false);

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
    inbox: unread.map(m => ({
      id: m.id,
      from: m.from_task_id,
      type: m.type,
      payload: m.payload,
    })),
    note: previousNote,
  };
}
