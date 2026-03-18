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
}

Wrap your JSON response in a code block like this:
\`\`\`json
{ ... }
\`\`\``;

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

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 1024,
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
