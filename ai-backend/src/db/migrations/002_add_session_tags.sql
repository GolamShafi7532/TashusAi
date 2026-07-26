-- =========================================================
-- MIGRATION: Add Session Tags Feature
-- Date: 2026-07-13
-- Description: Adds tags column to ai_chat_sessions for
--              categorizing and organizing sessions
-- =========================================================

-- Add tags column to ai_chat_sessions table
alter table ai_chat_sessions
    add column if not exists tags text[] default '{}';

-- Create index for efficient tag filtering
create index if not exists idx_sessions_tags on ai_chat_sessions using gin (tags);

-- Create a predefined tags table for consistency
create table if not exists ai_session_tags (
    id              uuid primary key default gen_random_uuid(),
    name            text unique not null,
    color           text not null default '#6b7280',
    description     text,
    usage_count     int not null default 0,
    is_active       boolean not null default true,
    created_by      uuid references ai_admin_users(id),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- Indexes
create index if not exists idx_session_tags_active on ai_session_tags(is_active);
create index if not exists idx_session_tags_name on ai_session_tags(name);

-- Enable RLS
alter table ai_session_tags enable row level security;

-- Deny anon access
create policy "deny_anon_session_tags" 
    on ai_session_tags as restrictive 
    for all to anon using (false);

-- Auto-update updated_at timestamp
create trigger trg_session_tags_updated_at
    before update on ai_session_tags
    for each row execute function ai_set_updated_at();

-- Insert default tags
insert into ai_session_tags (name, color, description) values
    ('billing', '#3b82f6', 'Payment and billing inquiries'),
    ('booking', '#10b981', 'Reservation and booking questions'),
    ('cancellation', '#ef4444', 'Booking cancellations and refunds'),
    ('technical', '#f59e0b', 'Technical issues and bugs'),
    ('vehicle', '#8b5cf6', 'Vehicle-specific questions'),
    ('policy', '#06b6d4', 'Policy and terms questions'),
    ('urgent', '#dc2626', 'High priority or urgent requests'),
    ('feedback', '#ec4899', 'Customer feedback and suggestions'),
    ('resolved', '#10b981', 'Issue has been resolved'),
    ('follow-up', '#f97316', 'Requires follow-up action')
on conflict (name) do nothing;

-- Function to increment tag usage count
create or replace function increment_tag_usage(tag_name text)
returns void language plpgsql as $$
begin
    update ai_session_tags
    set usage_count = usage_count + 1
    where name = tag_name;
end;
$$;

-- Add comment to column
comment on column ai_chat_sessions.tags is 'Array of tag names for categorizing sessions';
comment on table ai_session_tags is 'Predefined tags for organizing and categorizing chat sessions';
