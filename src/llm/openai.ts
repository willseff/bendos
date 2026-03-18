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

    const toolList = context.tools
      .map(t => `- ${t.name}: ${t.description}`)
      .join('\n');

    const systemPrompt = `You are an autonomous agent operating inside the bendos runtime.
Your job is to make progress on the given goal by selecting tools and providing inputs.

Available tools:
${toolList}

You MUST respond with valid JSON matching this schema:
{
  "thought": "your reasoning (1-500 chars)",
  "tool": "tool_name",
  "input": { ... tool-specific input ... },
  "note": "optional note for next step"
}`;

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
