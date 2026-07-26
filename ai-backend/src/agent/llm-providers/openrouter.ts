/**
 * OpenRouter LLM provider — OpenAI-compatible API that routes to
 * meta-llama/llama-3.1-70b-instruct (same model as Groq primary).
 *
 * Used as the third fallback in the chain:
 *   Groq key-1 → Groq key-2 → OpenRouter → [graceful degradation]
 *
 * Requires: OPENROUTER_API_KEY in environment.
 * Optional: Set in .env.local — if absent, this provider is skipped.
 */
import type { LLMProvider, LLMCallParams, StreamChunk } from './types';

// Same Anthropic→OpenAI message converter used by llm.ts (inlined to avoid
// circular import — keeping providers self-contained)
function convertMessages(messages: any[]): any[] {
  const result: any[] = [];
  for (const m of messages) {
    if (typeof m.content === 'string') {
      result.push({ role: m.role === 'admin' ? 'assistant' : m.role, content: m.content });
    } else if (Array.isArray(m.content)) {
      let text = '';
      const toolCalls: any[] = [];
      let isToolResult = false;
      let toolResultId = '';
      let toolResultContent = '';

      for (const block of m.content) {
        if (block.type === 'text')       text += block.text;
        else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id, type: 'function',
            function: { name: block.name, arguments: JSON.stringify(block.input) }
          });
        } else if (block.type === 'tool_result') {
          isToolResult = true;
          toolResultId      = block.tool_use_id;
          toolResultContent = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
        }
      }

      if (isToolResult) {
        result.push({ role: 'tool', tool_call_id: toolResultId, content: toolResultContent });
      } else {
        const msg: any = { role: m.role === 'admin' ? 'assistant' : m.role, content: text || null };
        if (toolCalls.length) msg.tool_calls = toolCalls;
        result.push(msg);
      }
    } else {
      result.push({ role: m.role === 'admin' ? 'assistant' : m.role, content: String(m.content || '') });
    }
  }
  return result;
}

export class OpenRouterProvider implements LLMProvider {
  readonly name = 'openrouter';
  private readonly apiKey: string;
  private readonly baseUrl = 'https://openrouter.ai/api/v1';
  private readonly model   = 'meta-llama/llama-3.1-70b-instruct';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async *stream(params: LLMCallParams): AsyncGenerator<StreamChunk> {
    const systemMessages: any[] = [{ role: 'system', content: params.system }];
    if (params.dynamicContext?.trim()) {
      systemMessages.push({ role: 'system', content: params.dynamicContext.trim() });
    }

    const openAiTools = (params.tools as any[]).map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));

    const body = {
      model: this.model,
      messages: [...systemMessages, ...convertMessages(params.messages as any[])],
      tools: openAiTools.length > 0 ? openAiTools : undefined,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      stream: true,
    };

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://tashus.com',
        'X-Title': 'Tashus AI Assistant',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw Object.assign(new Error(`OpenRouter ${res.status}: ${txt.slice(0, 200)}`), { status: res.status });
    }

    if (!res.body) throw new Error('OpenRouter: no response body');

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentToolCall: { id: string; name: string; arguments: string } | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const cleaned = line.trim();
        if (!cleaned || cleaned === 'data: [DONE]') continue;
        if (!cleaned.startsWith('data: ')) continue;

        try {
          const data   = JSON.parse(cleaned.slice(6));
          const choice = data.choices?.[0];
          if (!choice) continue;
          const delta = choice.delta;

          if (delta?.content)           yield { type: 'text', text: delta.content };

          if (delta?.tool_calls?.length) {
            const tc = delta.tool_calls[0];
            if (tc.function?.name) {
              if (currentToolCall) {
                try { yield { type: 'tool_call', id: currentToolCall.id, name: currentToolCall.name, args: JSON.parse(currentToolCall.arguments) }; } catch {}
              }
              currentToolCall = { id: tc.id || `or-tc-${Date.now()}`, name: tc.function.name, arguments: tc.function.arguments || '' };
            } else if (tc.function?.arguments && currentToolCall) {
              currentToolCall.arguments += tc.function.arguments;
            }
          }

          if ((choice.finish_reason === 'tool_calls' || choice.finish_reason) && currentToolCall) {
            try { yield { type: 'tool_call', id: currentToolCall.id, name: currentToolCall.name, args: JSON.parse(currentToolCall.arguments) }; } catch {}
            currentToolCall = null;
          }
        } catch { /* ignore parse errors */ }
      }
    }

    if (currentToolCall) {
      try { yield { type: 'tool_call', id: currentToolCall.id, name: currentToolCall.name, args: JSON.parse(currentToolCall.arguments) }; } catch {}
    }
  }
}
