-- Migration: v3.1.0 — Add token tracking columns to ai_tool_call_logs
-- Run this against your Supabase project if upgrading from v3.0.0
-- Safe to run multiple times (uses IF NOT EXISTS / DO blocks)

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

-- Index for token cost aggregation queries
create index if not exists idx_tool_logs_provider
  on ai_tool_call_logs(provider, created_at desc);
