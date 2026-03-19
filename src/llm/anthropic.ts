import type { LLMAdapter, LLMContext, AgentAction } from './index';

export class AnthropicAdapter implements LLMAdapter {
  name = 'anthropic';

  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'claude-opus-4-6') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async complete(context: LLMContext): Promise<AgentAction> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: this.apiKey });

    const baseInstructions = `\n\n## Response format\nRespond with a JSON object in a code block:\n\`\`\`json\n{\n  "thought": "your reasoning (required, 1-500 chars)",\n  "tool": "tool_name",\n  "input": { ... },\n  "scratchpad": "optional note appended to your rolling scratchpad"\n}\n\`\`\``;

    const systemPrompt = (context.systemPrompt ?? '') + baseInstructions;

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

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : '{}';

    // Try to extract JSON from code block first
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      return JSON.parse(codeBlockMatch[1].trim()) as AgentAction;
    }

    // Fall back to extracting raw JSON object
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as AgentAction;
    }

    return JSON.parse(text) as AgentAction;
  }
}
