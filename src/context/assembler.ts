import type { Task } from '../objects/task';
import { listEvents } from '../objects/event';
import { queryMemories } from '../objects/memory';
import { listArtifacts } from '../objects/artifact';
import { receiveMessages } from '../objects/message';
import { listRegisteredTools } from '../tools/registry';
import { getAgent } from '../agents/registry';
import type { LLMContext } from '../llm/index';

// Build the OS-level system prompt that every agent receives regardless of agent type.
// Agent-specific prompts are appended after the OS context.
function buildSystemPrompt(task: Task, agentSystemPrompt?: string, unreadCount = 0): string {
  const short = task.id.slice(0, 8);
  const allTools = listRegisteredTools();
  const allowedTools = task.capabilities
    ? allTools.filter(t => task.capabilities!.includes(t.name))
    : allTools;

  const toolList = allowedTools.map(t => `  ${t.name}`).join('\n');

  const envEntries = task.env ? Object.entries(task.env) : [];

  const lines: string[] = [
    `# System`,
    `You are a bendos agent.`,
    `Task ID : ${task.id}  (short: ${short})`,
    `Goal    : ${task.goal}`,
    task.parent_task_id ? `Parent  : ${task.parent_task_id.slice(0, 8)}` : '',
    task.job_id         ? `Job     : ${task.job_id}` : '',
    ``,
    `# Tools`,
    task.capabilities
      ? `You are restricted to these ${allowedTools.length} tool(s):`
      : `All ${allowedTools.length} registered tool(s) are available:`,
    toolList,
    ``,
    `# Filesystem`,
    `Use fs.ls and fs.read to navigate. Use fs.write to create or update files.`,
    `  /proc/self          your process directory (status, events, inbox, memory, env)`,
    `  /proc/self/status   your full task record including result after task.done`,
    `  /proc/self/env      your environment variables (key/value config)`,
    `  /proc/${short}      same as /proc/self`,
    `  /agents             agent definitions`,
    `  /tmp                shared scratch space — readable and writable by all tasks`,
    ``,
    `# Coordination`,
    `- Spawn subtasks with task.spawn. Join on them with task.wait.`,
    `- When task.wait resumes you, check your inbox for a task.result message.`,
    `- Share files between tasks by writing to /tmp (public) and reading from /tmp.`,
    `- Send messages to other tasks with message.send.`,
    `- Write persistent facts with memory.write.`,
    ``,
    ...(envEntries.length > 0 ? [
      `# Environment`,
      ...envEntries.map(([k, v]) => `  ${k}=${v}`),
      ``,
    ] : []),
  ].filter(l => l !== null) as string[];

  if (unreadCount > 0) {
    lines.push(`# Inbox`);
    lines.push(`You have ${unreadCount} unread message(s). Read /proc/self/inbox or call message.receive.`);
    lines.push(``);
  }

  if (agentSystemPrompt) {
    lines.push(`# Agent Instructions`);
    lines.push(agentSystemPrompt);
    lines.push(``);
  }

  return lines.join('\n').trim();
}

const SCRATCHPAD_MAX = 10;

export function assembleContext(task: Task, scratchpad: string[] = []): LLMContext {
  const allEvents = listEvents(task.id, 20);
  const memories = queryMemories(task.id);
  const artifacts = listArtifacts(task.id);
  const tools = listRegisteredTools();
  // Peek at inbox without marking read — the message.receive tool marks them read explicitly.
  const unread = receiveMessages(task.id, false);

  const agentDef = task.agent_type ? getAgent(task.agent_type) : undefined;
  const systemPrompt = buildSystemPrompt(task, agentDef?.systemPrompt, unread.length);

  // Filter out action.executed — the agent already knows what it chose each step.
  // Show only external/kernel events: signals, task lifecycle, errors, messages.
  const events = allEvents
    .filter(e => e.type !== 'action.executed')
    .slice(-10);

  return {
    goal: task.goal,
    taskId: task.id,
    systemPrompt,
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
    artifacts: artifacts.map(a => ({
      name: a.name,
      path: a.path,
      mimeType: a.mime_type,
      visibility: a.visibility,
    })),
    tools,
    inbox: unread.map(m => ({
      id: m.id,
      from: m.from_task_id,
      type: m.type,
      payload: m.payload,
    })),
    scratchpad: scratchpad.slice(-SCRATCHPAD_MAX),
  };
}
