import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';

let _client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!_client && env.ANTHROPIC_API_KEY) {
    _client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    });
  }
  return _client;
}

/**
 * Legacy completion helper using the Messages API instead of legacy Completions API.
 */
export async function callAnthropicCompletion(prompt: string, opts?: { model?: string; maxTokens?: number }) {
  const client = getClient();
  if (!client) return null;

  try {
    const res = await client.messages.create({
      model: opts?.model ?? 'claude-sonnet-4-5',
      max_tokens: opts?.maxTokens ?? 512,
      system: 'You are a helpful customer support assistant.',
      messages: [{ role: 'user', content: prompt }],
    });
    const block = res.content[0];
    if (block && block.type === 'text') {
      return block.text;
    }
    return null;
  } catch (err) {
    console.error('[Anthropic] Messages API call failed:', err);
    return null;
  }
}

/**
 * Generator function that streams events from Anthropic Messages API.
 */
export async function* streamAnthropicMessages(params: {
  model: string;
  system: string;
  messages: Anthropic.MessageParam[];
  tools?: Anthropic.Tool[];
  temperature?: number;
  max_tokens?: number;
}) {
  const client = getClient();
  if (!client) {
    throw new Error('Anthropic API key is missing or invalid');
  }

  const stream = await client.messages.create({
    model: params.model,
    system: params.system,
    messages: params.messages,
    temperature: params.temperature,
    max_tokens: params.max_tokens ?? 1024,
    ...(params.tools && params.tools.length > 0 ? { tools: params.tools } : {}),
    stream: true,
  });

  for await (const event of stream) {
    yield event;
  }
}

const anthropicClient = { callAnthropicCompletion, streamAnthropicMessages };
export default anthropicClient;
