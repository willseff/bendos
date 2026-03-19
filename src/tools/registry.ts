import type { ZodSchema } from 'zod';
import type { Task } from '../objects/task';
import { registerToolRecord } from '../objects/tool';

export interface ToolContext {
  taskId: string;
  task: Task;
}

export interface ToolDefinition<TInput = unknown> {
  name: string;
  description: string;
  hidden?: boolean;   // if true, tool works but is excluded from the agent's tool list
  inputSchema: ZodSchema<TInput>;
  execute(input: TInput, ctx: ToolContext): Promise<unknown>;
}

const registry = new Map<string, ToolDefinition<unknown>>();

export function registerTool<TInput>(def: ToolDefinition<TInput>): void {
  registry.set(def.name, def as ToolDefinition<unknown>);
}

export function getTool(name: string): ToolDefinition<unknown> | undefined {
  return registry.get(name);
}

export function listRegisteredTools(): Array<{ name: string; description: string }> {
  return Array.from(registry.values())
    .filter(t => !t.hidden)
    .map(t => ({ name: t.name, description: t.description }));
}

export function seedToolRegistry(): void {
  for (const tool of registry.values()) {
    registerToolRecord(tool.name, tool.description, { type: 'object' });
  }
}
