/**
 * Supabase server-side client — AI-only isolated database.
 *
 * Rules (from blueprint §0 & §9):
 *  - Uses SERVICE_ROLE key only. Never the anon key.
 *  - Never imported from any browser-facing code.
 *  - This project's SUPABASE_URL must point at a dedicated AI Supabase project,
 *    completely separate from any Tashus-owned Supabase resource.
 *
 * Source of truth: AI Chatbot blueprint.md §3.1
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

// ── Type helpers ──────────────────────────────────────────────────────────────
// Row types mirror the schema in db/schema.sql.
// Keep in sync when schema changes.

export type AdminUserRole = 'super_admin' | 'admin' | 'agent' | 'viewer';
export type SessionStatus = 'active' | 'handed_off' | 'closed' | 'archived';
export type MessageRole = 'user' | 'assistant' | 'admin' | 'system' | 'tool';
export type DocumentStatus = 'pending' | 'parsing' | 'embedding' | 'ready' | 'failed';
export type DocumentCategory = 'rental_policy' | 'insurance' | 'faq_source' | 'terms' | 'general';
export type KBEntryType = 'faq' | 'instruction' | 'promotion' | 'override';
export type ChannelType = 'widget' | 'email' | 'voice' | 'social';

export interface AiAdminUser {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: AdminUserRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiAdminSession {
  id: string;
  admin_user_id: string;
  refresh_token_hash: string;
  user_agent: string | null;
  ip_address: string | null;
  expires_at: string;
  created_at: string;
}

export interface AiChatSession {
  id: string;
  visitor_id: string;
  tashus_user_id: string | null;
  tashus_user_role: 'guest' | 'host' | null;
  channel: ChannelType;
  status: SessionStatus;
  is_ai_paused: boolean;
  assigned_admin_id: string | null;
  locale: string;
  metadata: Record<string, unknown>;
  started_at: string;
  last_message_at: string;
  closed_at: string | null;
}

export interface AiChatMessage {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  tool_calls: unknown[] | null;
  tool_results: unknown[] | null;
  sent_by_admin_id: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  created_at: string;
}

export interface AiDocument {
  id: string;
  title: string;
  category: DocumentCategory;
  original_filename: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number | null;
  status: DocumentStatus;
  error_message: string | null;
  uploaded_by: string | null;
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AiDocumentChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  page_number: number | null;
  token_count: number | null;
  // embedding stored as vector — returned as number[] from pgvector
  embedding: number[];
  created_at: string;
}

export interface AiKnowledgeBase {
  id: string;
  entry_type: KBEntryType;
  question: string | null;
  answer: string;
  tags: string[];
  priority: number;
  embedding: number[] | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiAgentConfig {
  id: string;
  config_key: string;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  enabled_tools: string[];
  is_active: boolean;
  updated_by: string | null;
  updated_at: string;
}

export interface AiToolCallLog {
  id: string;
  session_id: string | null;
  tool_name: string;
  http_method: 'GET'; // enforced by DB CHECK constraint
  endpoint: string;
  request_params: Record<string, unknown> | null;
  response_status: number | null;
  response_summary: Record<string, unknown> | null;
  cache_hit: boolean;
  duration_ms: number | null;
  // v3.1.0: token tracking columns
  tokens_in: number | null;
  tokens_out: number | null;
  token_cost_usd: number | null;
  provider: string | null;  // 'groq' | 'openrouter' | 'anthropic'
  created_at: string;
}

// ── Database type map ─────────────────────────────────────────────────────────
export interface Database {
  public: {
    Tables: {
      ai_admin_users:    { Row: AiAdminUser };
      ai_admin_sessions: { Row: AiAdminSession };
      ai_chat_sessions:  { Row: AiChatSession };
      ai_chat_messages:  { Row: AiChatMessage };
      ai_documents:      { Row: AiDocument };
      ai_document_chunks:{ Row: AiDocumentChunk };
      ai_knowledge_base: { Row: AiKnowledgeBase };
      ai_agent_configs:  { Row: AiAgentConfig };
      ai_tool_call_logs: { Row: AiToolCallLog };
    };
  };
}

// ── Singleton client ───────────────────────────────────────────────────────────
let _client: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (_client) return _client;

  _client = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      // keepalive: true reuses the HTTP/2 connection across warm Vercel invocations,
      // eliminating the TCP handshake overhead on the 2nd–Nth sequential requests.
      fetch: (url: RequestInfo | URL, options?: RequestInit) =>
        fetch(url, { ...options, keepalive: true }),
    },
  });

  return _client;
}

// Convenience alias
export const db = getSupabaseClient();
