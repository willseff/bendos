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
      .slice(-10)
      .map(e => `[${e.type}] ${JSON.stringify(e.payload)}`)
      .join('\n');

    const memorySummary = context.memories
      .map(m => `- [${m.tags.join(', ')}] ${m.content}`)
      .join('\n');

    const userMessage = `Goal: ${context.goal}

Recent events:
${recentEvents || '(none)'}

Memories:
${memorySummary || '(none)'}

${context.note ? `Previous note: ${context.note}` : ''}

What is your next action?`;

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
