/**
 * Message types shared throughout the widget.
 */
export type MessageRole = 'user' | 'assistant' | 'admin' | 'system' | 'tool';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  streaming?: boolean;
  createdAt: Date;
  toolName?: string; // for tool_start/result chips
  toolResult?: string;
}

export type StreamEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_start'; tool: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; result: unknown }
  | { type: 'admin_message'; message: { id: string; role: string; content: string; created_at: string } }
  | { type: 'paused'; message?: { role: string; content: string } }
  | { type: 'released' }
  | { type: 'done'; message: string; sources: { title: string; page?: number }[] }
  | { type: 'error'; message: string };

export interface WidgetConfig {
  backendUrl: string;
  jwtCookieName?: string; // attribute from host page
}
