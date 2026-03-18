import { z } from 'zod';

export const AgentActionSchema = z.object({
  thought: z.string().min(1).max(500),
  tool: z.string().min(1),
  input: z.record(z.unknown()),
  note: z.string().optional(),
});

export type AgentAction = z.infer<typeof AgentActionSchema>;

export interface LLMContext {
  goal: string;
  events: Array<{ type: string; payload: unknown; created_at: number }>;
  memories: Array<{ id: string; content: string; tags: string[] }>;
  artifacts: Array<{ name: string; path: string | null; mimeType: string; visibility: string }>;
  tools: Array<{ name: string; description: string }>;
  // Unread messages in this task's inbox from other tasks.
  inbox: Array<{ id: string; from: string; type: string; payload: unknown }>;
  note?: string;
}

export interface LLMAdapter {
  name: string;
  complete(context: LLMContext): Promise<AgentAction>;
}

export function validateAction(raw: unknown): AgentAction | null {
  const result = AgentActionSchema.safeParse(raw);
  if (result.success) return result.data;
  return null;
}
