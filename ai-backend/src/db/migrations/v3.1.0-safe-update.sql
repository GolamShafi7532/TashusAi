-- ============================================================
-- v3.1.0 Safe Update Migration
-- Run this in Supabase SQL Editor if tables already exist.
-- All statements are idempotent — safe to run multiple times.
-- ============================================================

-- 1. Add token tracking columns to ai_tool_call_logs (if not already present)
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'ai_tool_call_logs' and column_name = 'tokens_in'
  ) then
    alter table ai_tool_call_logs add column tokens_in int;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'ai_tool_call_logs' and column_name = 'tokens_out'
  ) then
    alter table ai_tool_call_logs add column tokens_out int;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'ai_tool_call_logs' and column_name = 'token_cost_usd'
  ) then
    alter table ai_tool_call_logs add column token_cost_usd numeric(12,8);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'ai_tool_call_logs' and column_name = 'provider'
  ) then
    alter table ai_tool_call_logs add column provider text;
  end if;
end $$;

-- 2. Add provider index for daily/monthly cost aggregation
create index if not exists idx_tool_logs_provider
  on ai_tool_call_logs(provider, created_at desc);

-- 3. Ensure default agent config exists (needed for Config page + orchestrator)
insert into ai_agent_configs (config_key, system_prompt, model, temperature, max_tokens, enabled_tools, is_active)
values (
  'production',
  'You are a helpful customer support assistant for Tashus — an Australian peer-to-peer car sharing platform.',
  'llama-3.3-70b-versatile',
  0.25,
  1024,
  '{search_vehicles,get_vehicle_details,check_availability,validate_voucher,search_knowledge_base}',
  true
)
on conflict (config_key) do nothing;

-- 4. Verify the search_knowledge_base RPC function exists (needed for RAG)
-- If it errors, run schema.sql sections 9 only (the two create function blocks).
select proname from pg_proc where proname in ('search_knowledge_base', 'search_document_chunks');
