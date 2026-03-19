import type { LLMAdapter, LLMContext, AgentAction } from './index';

export class OpenAIAdapter implements LLMAdapter {
  name = 'openai';

  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'gpt-4o') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async complete(context: LLMContext): Promise<AgentAction> {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: this.apiKey });

    const responseFormat = `\n\nYou MUST respond with valid JSON:\n{\n  "thought": "your reasoning (1-500 chars)",\n  "tool": "tool_name",\n  "input": { ... tool-specific input ... },\n  "note": "optional note for next step"\n}`;

    // The assembler always provides a fully-built system prompt.
    const systemPrompt = (context.systemPrompt ?? '') + responseFormat;

    const recentEvents = context.events
      .map(e => `[${e.type}] ${JSON.stringify(e.payload)}`)
      .join('\n');

    const memorySummary = context.memories
      .map(m => `- [${m.tags.join(', ') || 'untagged'}] ${m.content}`)
      .join('\n');

    const inboxSummary = context.inbox.length > 0
      ? context.inbox.map(m => `- [${m.type}] from=${m.from.slice(0, 8)} ${JSON.stringify(m.payload)}`).join('\n')
      : '(empty)';

    const scratchpadSummary = context.scratchpad.length > 0
      ? context.scratchpad.map((s, i) => `${i + 1}. ${s}`).join('\n')
      : '(empty)';

    const userMessage = `Goal: ${context.goal}

Scratchpad (your notes from previous steps):
${scratchpadSummary}

Kernel events (signals, task lifecycle, errors):
${recentEvents || '(none)'}

Memories:
${memorySummary || '(none)'}

Inbox (unread messages from other tasks):
${inboxSummary}

When the goal is fully achieved, call task.done. What is your next action?`;

    const response = await client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content ?? '{}';
    return JSON.parse(content) as AgentAction;
  }
}
