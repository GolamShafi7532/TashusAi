/**
 * Provider abstraction types for the LLM fallback chain (v3.1.0 — Phase D.2)
 */

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'usage';
  // text chunk
  text?: string;
  // tool call
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
  // token usage
  input_tokens?: number;
  output_tokens?: number;
}

export interface LLMCallParams {
  system: string;
  dynamicContext?: string;
  messages: unknown[];
  tools: unknown[];
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface LLMProvider {
  readonly name: string;
  stream(params: LLMCallParams): AsyncGenerator<StreamChunk>;
}
