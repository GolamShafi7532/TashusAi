import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';
import { env } from './env';

// ── Type exports ──────────────────────────────────────────────────────────────
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
  metadata: Record<string, any>;
  started_at: string;
  last_message_at: string;
  closed_at: string | null;
}

export interface AiChatMessage {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  tool_calls: any[] | null;
  tool_results: any[] | null;
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
  http_method: 'GET';
  endpoint: string;
  request_params: Record<string, any> | null;
  response_status: number | null;
  response_summary: Record<string, any> | null;
  cache_hit: boolean;
  duration_ms: number | null;
  // v3.1.0: token tracking columns
  tokens_in: number | null;
  tokens_out: number | null;
  token_cost_usd: number | null;
  provider: string | null;   // e.g. 'groq', 'openrouter', 'anthropic'
  created_at: string;
}

export interface AiSessionTag {
  id: string;
  name: string;
  color: string | null;
  is_active: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface AiCannedResponse {
  id: string;
  title: string;
  content: string;
  category: string | null;
  shortcut: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      ai_admin_users:      { Row: AiAdminUser };
      ai_admin_sessions:   { Row: AiAdminSession };
      ai_chat_sessions:    { Row: AiChatSession };
      ai_chat_messages:    { Row: AiChatMessage };
      ai_documents:        { Row: AiDocument };
      ai_knowledge_base:   { Row: AiKnowledgeBase };
      ai_agent_configs:    { Row: AiAgentConfig };
      ai_tool_call_logs:   { Row: AiToolCallLog };
      ai_canned_responses: { Row: AiCannedResponse };
      ai_session_tags:     { Row: AiSessionTag };
    };
  };
}

// ── Local file-based store (dev mode, no Supabase) ────────────────────────────

interface LocalStoreData {
  ai_admin_users: AiAdminUser[];
  ai_admin_sessions: AiAdminSession[];
  ai_chat_sessions: AiChatSession[];
  ai_chat_messages: AiChatMessage[];
  ai_documents: AiDocument[];
  ai_knowledge_base: AiKnowledgeBase[];
  ai_agent_configs: AiAgentConfig[];
  ai_tool_call_logs: AiToolCallLog[];
  ai_canned_responses: AiCannedResponse[];
  ai_session_tags: AiSessionTag[];
}

const localStorePath = path.join(process.cwd(), '.local-admin-data', 'auth-store.json');

function createDefaultStore(): LocalStoreData {
  return {
    ai_admin_users: [],
    ai_admin_sessions: [],
    ai_chat_sessions: [],
    ai_chat_messages: [],
    ai_documents: [],
    ai_knowledge_base: [],
    ai_agent_configs: [],
    ai_tool_call_logs: [],
    ai_canned_responses: [],
    ai_session_tags: [],
  };
}

// Always reads from disk — fixes the core bug where in-memory store was always empty
async function readLocalStore(): Promise<LocalStoreData> {
  try {
    const data = await fs.readFile(localStorePath, 'utf8');
    const parsed = JSON.parse(data) as Partial<LocalStoreData>;
    // Merge parsed data with defaults to handle missing keys gracefully
    const defaults = createDefaultStore();
    return {
      ai_admin_users:      parsed.ai_admin_users    ?? defaults.ai_admin_users,
      ai_admin_sessions:   parsed.ai_admin_sessions ?? defaults.ai_admin_sessions,
      ai_chat_sessions:    parsed.ai_chat_sessions  ?? defaults.ai_chat_sessions,
      ai_chat_messages:    parsed.ai_chat_messages  ?? defaults.ai_chat_messages,
      ai_documents:        parsed.ai_documents      ?? defaults.ai_documents,
      ai_knowledge_base:   parsed.ai_knowledge_base ?? defaults.ai_knowledge_base,
      ai_agent_configs:    parsed.ai_agent_configs  ?? defaults.ai_agent_configs,
      ai_tool_call_logs:   parsed.ai_tool_call_logs ?? defaults.ai_tool_call_logs,
      ai_canned_responses: parsed.ai_canned_responses ?? defaults.ai_canned_responses,
      ai_session_tags:     parsed.ai_session_tags     ?? defaults.ai_session_tags,
    };
  } catch {
    return createDefaultStore();
  }
}

async function writeLocalStore(store: LocalStoreData): Promise<void> {
  await fs.mkdir(path.dirname(localStorePath), { recursive: true });
  await fs.writeFile(localStorePath, JSON.stringify(store, null, 2), 'utf8');
}

function normalizeValue(column: string, value: unknown) {
  if (column === 'email' && typeof value === 'string') return value.toLowerCase();
  return value;
}

function mkId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── LocalQuery: read-only queries ─────────────────────────────────────────────

class LocalQuery {
  private _filters: Array<{ column: string; value: unknown; op: 'eq' | 'neq' | 'is' | 'contains' | 'gte' | 'lte' }> = [];
  private _limit: number | null = null;
  private _order: { column: string; ascending: boolean } | null = null;
  private _tableName: keyof LocalStoreData;

  constructor(tableName: keyof LocalStoreData) {
    this._tableName = tableName;
  }

  select(_fields?: string) { return this; }

  eq(column: string, value: unknown) {
    this._filters.push({ column, value, op: 'eq' });
    return this;
  }

  neq(column: string, value: unknown) {
    this._filters.push({ column, value, op: 'neq' });
    return this;
  }

  is(column: string, value: unknown) {
    this._filters.push({ column, value, op: 'is' });
    return this;
  }

  contains(column: string, value: unknown) {
    this._filters.push({ column, value, op: 'contains' });
    return this;
  }

  gte(column: string, value: unknown) {
    this._filters.push({ column, value, op: 'gte' });
    return this;
  }

  lte(column: string, value: unknown) {
    this._filters.push({ column, value, op: 'lte' });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this._order = { column, ascending: opts?.ascending ?? true };
    return this;
  }

  limit(value: number) {
    this._limit = value;
    return this;
  }

  // Supports .throwOnError().catch() chaining used in the health check
  throwOnError() { return this; }
  catch<T>(fn: (e: unknown) => T) { return this.execute().catch(fn); }

  async single(): Promise<{ data: Record<string, unknown> | null; error: null }> {
    const rows = await this.execute();
    return { data: (rows.data as any[])[0] ?? null, error: null };
  }

  async maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: null }> {
    const rows = await this.execute();
    return { data: (rows.data as any[])[0] ?? null, error: null };
  }

  // Thenable so `await db.from(...).select(...)...` works without .single()
  then<T1, T2>(
    onfulfilled?: ((v: { data: any[]; error: null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((r: unknown) => T2 | PromiseLike<T2>) | null
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{ data: any[]; error: null }> {
    const store = await readLocalStore();
    let rows = [...(store[this._tableName] as any[])] as Array<Record<string, unknown>>;

    for (const f of this._filters) {
      rows = rows.filter((row) => {
        const col = normalizeValue(f.column, row[f.column]);
        const val = normalizeValue(f.column, f.value);
        if (f.op === 'eq') return col === val;
        if (f.op === 'neq') return col !== val;
        if (f.op === 'is') return col === val || (val === null && col == null);
        if (f.op === 'contains') return Array.isArray(col) && (col as unknown[]).includes(val);
        if (f.op === 'gte') return (col as any) >= (val as any);
        if (f.op === 'lte') return (col as any) <= (val as any);
        return true;
      });
    }

    if (this._order) {
      const { column, ascending } = this._order;
      rows.sort((a, b) => {
        const av = a[column] as any, bv = b[column] as any;
        if (av == null && bv == null) return 0;
        if (av == null) return ascending ? -1 : 1;
        if (bv == null) return ascending ? 1 : -1;
        return ascending ? (av > bv ? 1 : av < bv ? -1 : 0) : (av < bv ? 1 : av > bv ? -1 : 0);
      });
    }

    if (this._limit !== null) rows = rows.slice(0, this._limit);
    return { data: rows, error: null };
  }
}

// ── LocalMutationQuery: insert / update / delete ──────────────────────────────

class LocalInsertQuery {
  private _filters: Array<[string, unknown]> = [];
  private _selectCalled = false;

  constructor(
    private tableName: keyof LocalStoreData,
    private payload: Record<string, unknown> | Record<string, unknown>[]
  ) {}

  select(_fields?: string) { this._selectCalled = true; return this; }

  async single(): Promise<{ data: Record<string, unknown>; error: null }> {
    const row = await this.executeInsert();
    return { data: Array.isArray(row) ? row[0] : row, error: null };
  }

  then<T1, T2>(
    onfulfilled?: ((v: { data: Record<string, unknown>; error: null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((r: unknown) => T2 | PromiseLike<T2>) | null
  ) {
    return this.executeInsert().then(
      (row) => onfulfilled?.({ data: Array.isArray(row) ? row[0] : row, error: null }) as any,
      onrejected as any
    );
  }

  catch<T>(fn: (e: unknown) => T) { return this.executeInsert().catch(fn); }
  finally(fn?: (() => void) | null) { return this.executeInsert().finally(fn); }

  private async executeInsert(): Promise<Record<string, unknown> | Record<string, unknown>[]> {
    const store = await readLocalStore();
    const payloads = Array.isArray(this.payload) ? this.payload : [this.payload];
    const rows = payloads.map((p) => ({
      id: mkId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...p,
    }));
    (store[this.tableName] as any[]).push(...rows);
    await writeLocalStore(store);
    return rows.length === 1 ? rows[0] : rows;
  }
}

class LocalUpdateQuery {
  private _filters: Array<[string, unknown]> = [];
  private _selectCalled = false;

  constructor(
    private tableName: keyof LocalStoreData,
    private payload: Record<string, unknown>
  ) {}

  eq(column: string, value: unknown) {
    this._filters.push([column, value]);
    return this;
  }

  select(_fields?: string) {
    this._selectCalled = true;
    return this;
  }

  single() {
    return this._apply().then((r) => ({ data: (r.data as any[])[0] ?? null, error: null }));
  }

  private async _apply(): Promise<{ data: any[]; error: null }> {
    const store = await readLocalStore();
    const rows = store[this.tableName] as any[];
    const matched = rows.filter((row) =>
      this._filters.every(([col, val]) => row[col] === normalizeValue(col, val))
    );
    matched.forEach((row) => Object.assign(row, { ...this.payload, updated_at: new Date().toISOString() }));
    await writeLocalStore(store);
    return { data: matched, error: null };
  }
}

class LocalDeleteQuery {
  private _filters: Array<[string, unknown]> = [];

  constructor(private tableName: keyof LocalStoreData) {}

  eq(column: string, value: unknown) {
    this._filters.push([column, value]);
    return this._apply();
  }

  private async _apply(): Promise<{ data: any[]; error: null }> {
    const store = await readLocalStore();
    const before = store[this.tableName] as any[];
    const after = before.filter(
      (row) => !this._filters.every(([col, val]) => row[col] === normalizeValue(col, val))
    );
    (store[this.tableName] as any) = after;
    await writeLocalStore(store);
    return { data: [], error: null };
  }
}

// ── Local Supabase client factory ─────────────────────────────────────────────

function createLocalSupabaseClient() {
  return {
    from(tableName: keyof LocalStoreData) {
      return {
        select: (fields?: string) => new LocalQuery(tableName).select(fields),
        insert: (payload: Record<string, unknown> | Record<string, unknown>[]) =>
          new LocalInsertQuery(tableName, payload),
        update: (payload: Record<string, unknown>) => new LocalUpdateQuery(tableName, payload),
        delete: () => new LocalDeleteQuery(tableName),
      };
    },
    // Stub out storage for local dev — upload/download not supported without Supabase
    storage: {
      from: (_bucket: string) => ({
        upload: async (_path: string, _data: unknown, _opts?: unknown) => ({ error: null }),
        download: async (_path: string) => ({ data: null, error: { message: 'Storage not available in local dev mode' } }),
        getPublicUrl: (_path: string) => ({ data: { publicUrl: '' } }),
        createSignedUrl: async (_path: string, _exp: number) => ({ data: { signedUrl: '' }, error: null }),
      }),
    },
    rpc: async (_fn: string, _args?: unknown) => ({ data: [], error: null }),
  };
}

// ── Exported client singleton ─────────────────────────────────────────────────

let _realClient: SupabaseClient<Database> | null = null;
let _localClient: ReturnType<typeof createLocalSupabaseClient> | null = null;

function hasRealSupabaseConfig(): boolean {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) return false;
  if (url === 'https://example.supabase.co' || url === 'http://localhost:54321') return false;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co(\/)?$/i.test(url)) return false;

  return true;
}

export function getSupabaseClient(): SupabaseClient<Database> | ReturnType<typeof createLocalSupabaseClient> {
  const hasRealConfig = hasRealSupabaseConfig();

  if (!hasRealConfig) {
    if (!_localClient) _localClient = createLocalSupabaseClient();
    return _localClient;
  }

  if (_realClient) return _realClient;
  _realClient = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _realClient;
}

export const db = getSupabaseClient();

/** Returns true when running against the local file-based store (no real Supabase) */
export function isLocalDevMode(): boolean {
  return !hasRealSupabaseConfig();
}
