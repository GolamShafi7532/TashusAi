-- =========================================================
-- TASHUS AI ECOSYSTEM — Isolated Database Schema
-- Run this in a NEW, dedicated Supabase Postgres project.
-- NEVER run against any Tashus-owned infrastructure.
-- Source of truth: AI Chatbot blueprint.md §3.1
-- =========================================================

-- =========================================================
-- 0. EXTENSIONS
-- =========================================================
create extension if not exists vector;
create extension if not exists pgcrypto; -- for gen_random_uuid()

-- =========================================================
-- 1. ADMIN / AUTH
-- =========================================================
create table ai_admin_users (
    id              uuid primary key default gen_random_uuid(),
    email           text unique not null,
    password_hash   text not null,               -- argon2id
    display_name    text not null,
    role            text not null default 'agent'
                    check (role in ('super_admin','admin','agent','viewer')),
    is_active       boolean not null default true,
    last_login_at   timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create table ai_admin_sessions (
    id                  uuid primary key default gen_random_uuid(),
    admin_user_id       uuid not null references ai_admin_users(id) on delete cascade,
    refresh_token_hash  text not null,
    user_agent          text,
    ip_address          inet,
    expires_at          timestamptz not null,
    created_at          timestamptz not null default now()
);

-- =========================================================
-- 2. CHAT SESSIONS & MESSAGES
-- =========================================================
create table ai_chat_sessions (
    id                  uuid primary key default gen_random_uuid(),
    -- widget-issued anonymous id, persisted client-side, links repeat visits
    visitor_id          text not null,
    -- populated only if Tashus JWT was verified read-only (never stored raw)
    tashus_user_id      text,
    tashus_user_role    text check (tashus_user_role in ('guest','host', null)),
    channel             text not null default 'widget'
                        check (channel in ('widget','email','voice','social')),
    status              text not null default 'active'
                        check (status in ('active','handed_off','closed','archived')),
    -- circuit breaker: when true, the AI agent MUST NOT generate a reply
    is_ai_paused        boolean not null default false,
    assigned_admin_id   uuid references ai_admin_users(id),
    locale              text default 'en-AU',
    -- stores: page_url, referrer, device, conversation_summary (rolling window)
    metadata            jsonb not null default '{}'::jsonb,
    started_at          timestamptz not null default now(),
    last_message_at     timestamptz not null default now(),
    closed_at           timestamptz
);

create index idx_sessions_status          on ai_chat_sessions(status);
create index idx_sessions_visitor         on ai_chat_sessions(visitor_id);
create index idx_sessions_assigned_admin  on ai_chat_sessions(assigned_admin_id);
create index idx_sessions_last_message    on ai_chat_sessions(last_message_at desc);

create table ai_chat_messages (
    id               uuid primary key default gen_random_uuid(),
    session_id       uuid not null references ai_chat_sessions(id) on delete cascade,
    role             text not null
                     check (role in ('user','assistant','admin','system','tool')),
    content          text not null,
    -- structured record of tool calls made while producing this message
    tool_calls       jsonb,
    tool_results     jsonb,
    -- if role='admin', which human sent it (handoff mode)
    sent_by_admin_id uuid references ai_admin_users(id),
    tokens_in        int,
    tokens_out       int,
    latency_ms       int,
    created_at       timestamptz not null default now()
);

create index idx_messages_session on ai_chat_messages(session_id, created_at);

-- ===============================================f==========
-- 3. DOCUMENTS (PDF ingestion) + VECTOR CHUNKS
-- =========================================================
create table ai_documents (
    id                uuid primary key default gen_random_uuid(),
    title             text not null,
    category          text not null default 'general'
                      check (category in ('rental_policy','insurance','faq_source','terms','general')),
    original_filename text not null,
    storage_path      text not null,   -- path in Supabase Storage bucket `ai-documents`
    mime_type         text not null default 'application/pdf',
    file_size_bytes   bigint,
    status            text not null default 'pending'
                      check (status in ('pending','parsing','embedding','ready','failed')),
    error_message     text,
    uploaded_by       uuid references ai_admin_users(id),
    version           int not null default 1,
    is_active         boolean not null default true,  -- superseded versions set to false
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

create index idx_documents_status on ai_documents(status);
create index idx_documents_active on ai_documents(is_active);

create table ai_document_chunks (
    id           uuid primary key default gen_random_uuid(),
    document_id  uuid not null references ai_documents(id) on delete cascade,
    chunk_index  int not null,
    content      text not null,   -- prefixed with header breadcrumb, e.g. "Cancellation Policy > Late Return Fees: ..."
    page_number  int,
    token_count  int,
    embedding    vector(1536) not null,  -- dimension must match EMBEDDING_DIMENSION env var
    created_at   timestamptz not null default now()
);

create index idx_chunks_document on ai_document_chunks(document_id);
-- HNSW index for approximate nearest-neighbour search at scale
create index idx_chunks_embedding_hnsw on ai_document_chunks
    using hnsw (embedding vector_cosine_ops);

-- =========================================================
-- 4. MANUAL KNOWLEDGE BASE (admin-authored, highest priority)
-- =========================================================
create table ai_knowledge_base (
    id          uuid primary key default gen_random_uuid(),
    entry_type  text not null default 'faq'
                check (entry_type in ('faq','instruction','promotion','override')),
    question    text,         -- nullable for 'instruction'/'promotion' types
    answer      text not null,
    tags        text[] default '{}',
    -- higher priority wins; KB always beats document chunks in retrieval merge
    priority    int not null default 100,
    embedding   vector(1536), -- for semantic matching against user queries
    is_active   boolean not null default true,
    starts_at   timestamptz,  -- null = always active from creation
    ends_at     timestamptz,  -- null = never expires; set for promotional entries
    created_by  uuid references ai_admin_users(id),
    updated_by  uuid references ai_admin_users(id),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index idx_kb_active          on ai_knowledge_base(is_active);
create index idx_kb_entry_type      on ai_knowledge_base(entry_type);
create index idx_kb_embedding_hnsw  on ai_knowledge_base
    using hnsw (embedding vector_cosine_ops);

-- =========================================================
-- 5. AGENT CONFIGURATION & TOOL AUDIT LOG
-- =========================================================
create table ai_agent_configs (
    id              uuid primary key default gen_random_uuid(),
    config_key      text unique not null,     -- e.g. 'production', 'staging'
    system_prompt   text not null,
    model           text not null default 'claude-sonnet-4-5',
    temperature     numeric(3,2) not null default 0.30,
    max_tokens      int not null default 1024,
    enabled_tools   text[] not null default
                    '{search_vehicles,check_availability,validate_voucher,get_promotions,search_knowledge_base,escalate_to_human}',
    is_active       boolean not null default true,
    updated_by      uuid references ai_admin_users(id),
    updated_at      timestamptz not null default now()
);

-- Every single call the agent makes to the Tashus Read-Only Adapter is logged here.
-- This table is the compliance proof that no mutating call was ever made.
create table ai_tool_call_logs (
    id               uuid primary key default gen_random_uuid(),
    session_id       uuid references ai_chat_sessions(id) on delete set null,
    tool_name        text not null,
    -- DB-level constraint: mutations are structurally impossible
    http_method      text not null check (http_method = 'GET'),
    endpoint         text not null,
    request_params   jsonb,
    response_status  int,
    response_summary jsonb,
    cache_hit        boolean not null default false,
    duration_ms      int,
    -- v3.1.0: token tracking (nullable — only set for LLM-turn logs, not raw tool calls)
    tokens_in        int,
    tokens_out       int,
    token_cost_usd   numeric(12,8),
    provider         text,           -- 'groq' | 'openrouter' | 'anthropic'
    created_at       timestamptz not null default now()
);

create index idx_tool_logs_session    on ai_tool_call_logs(session_id);
create index idx_tool_logs_created_at on ai_tool_call_logs(created_at desc);
create index idx_tool_logs_tool_name  on ai_tool_call_logs(tool_name);
-- v3.1.0: index for token cost queries (daily/monthly aggregation)
create index idx_tool_logs_provider   on ai_tool_call_logs(provider, created_at desc);

-- =========================================================
-- 6. FUTURE-MODULE PLACEHOLDER TABLES (Pillar 4)
-- =========================================================
create table ai_input_channels (
    id           uuid primary key default gen_random_uuid(),
    channel_type text not null
                 check (channel_type in ('widget','email','voice','social')),
    is_enabled   boolean not null default false,
    -- e.g. IMAP creds ref, Twilio SID ref — actual secrets stored in vault
    config       jsonb not null default '{}'::jsonb,
    created_at   timestamptz not null default now()
);

-- Seed the 4 known channel types (all disabled except widget)
insert into ai_input_channels (channel_type, is_enabled) values
    ('widget', true),
    ('email',  false),
    ('voice',  false),
    ('social', false);

-- =========================================================
-- 7. ROW LEVEL SECURITY
-- =========================================================
-- Enable RLS on every table. The backend uses service_role only.
-- No anon key ever has table-level access.
alter table ai_admin_users       enable row level security;
alter table ai_admin_sessions    enable row level security;
alter table ai_chat_sessions     enable row level security;
alter table ai_chat_messages     enable row level security;
alter table ai_documents         enable row level security;
alter table ai_document_chunks   enable row level security;
alter table ai_knowledge_base    enable row level security;
alter table ai_agent_configs     enable row level security;
alter table ai_tool_call_logs    enable row level security;
alter table ai_input_channels    enable row level security;

-- service_role bypasses RLS by default in Supabase.
-- Deny all access to the anon role explicitly.
do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_admin_users','ai_admin_sessions','ai_chat_sessions','ai_chat_messages',
    'ai_documents','ai_document_chunks','ai_knowledge_base',
    'ai_agent_configs','ai_tool_call_logs','ai_input_channels'
  ] loop
    execute format(
      'create policy "deny_anon_%s" on %I as restrictive for all to anon using (false)',
      t, t
    );
  end loop;
end $$;

-- =========================================================
-- 8. UPDATED_AT TRIGGER (auto-maintain updated_at columns)
-- =========================================================
create or replace function ai_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_admin_users_updated_at
  before update on ai_admin_users
  for each row execute function ai_set_updated_at();

create trigger trg_documents_updated_at
  before update on ai_documents
  for each row execute function ai_set_updated_at();

create trigger trg_knowledge_base_updated_at
  before update on ai_knowledge_base
  for each row execute function ai_set_updated_at();

-- =========================================================
-- 9. RAG RETRIEVAL FUNCTIONS (pgvector similarity search)
-- Called by src/rag/retriever.ts via supabase.rpc()
-- =========================================================

-- Knowledge base semantic search
create or replace function search_knowledge_base(
    query_embedding    vector(1536),
    similarity_threshold float default 0.75,
    match_count        int default 5
)
returns table (
    id          uuid,
    question    text,
    answer      text,
    priority    int,
    similarity  float
)
language sql stable as $$
    select
        kb.id,
        kb.question,
        kb.answer,
        kb.priority,
        1 - (kb.embedding <=> query_embedding) as similarity
    from ai_knowledge_base kb
    where
        kb.is_active = true
        and kb.embedding is not null
        and (kb.starts_at is null or kb.starts_at <= now())
        and (kb.ends_at   is null or kb.ends_at   >= now())
        and 1 - (kb.embedding <=> query_embedding) >= similarity_threshold
    order by
        kb.embedding <=> query_embedding asc,  -- closest first
        kb.priority desc                         -- higher priority wins ties
    limit match_count;
$$;

-- Document chunk semantic search
create or replace function search_document_chunks(
    query_embedding  vector(1536),
    match_count      int default 8
)
returns table (
    id                uuid,
    content           text,
    "pageNumber"      int,
    "documentTitle"   text,
    "documentCategory" text
)
language sql stable as $$
    select
        dc.id,
        dc.content,
        dc.page_number              as "pageNumber",
        d.title                     as "documentTitle",
        d.category                  as "documentCategory"
    from ai_document_chunks dc
    join ai_documents d on d.id = dc.document_id
    where
        d.is_active = true
        and d.status = 'ready'
    order by dc.embedding <=> query_embedding asc
    limit match_count;
$$;
