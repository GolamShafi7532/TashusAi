-- =========================================================
-- MIGRATION: Add Canned Responses Feature
-- Date: 2026-07-13
-- Description: Adds table for storing quick reply templates
--              that admins can insert during chat sessions
-- =========================================================

-- Create canned_responses table
create table if not exists ai_canned_responses (
    id              uuid primary key default gen_random_uuid(),
    title           text not null,                     -- Short name/label for the response
    content         text not null,                     -- The actual message template
    shortcut        text unique,                       -- Optional keyboard shortcut (e.g., '/greeting')
    category        text not null default 'general'
                    check (category in ('greeting','booking','policy','technical','closing','general')),
    is_active       boolean not null default true,
    usage_count     int not null default 0,           -- Track how often it's used
    created_by      uuid references ai_admin_users(id),
    updated_by      uuid references ai_admin_users(id),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- Indexes for performance
create index idx_canned_responses_active on ai_canned_responses(is_active);
create index idx_canned_responses_category on ai_canned_responses(category);
create index idx_canned_responses_shortcut on ai_canned_responses(shortcut) where shortcut is not null;

-- Enable RLS
alter table ai_canned_responses enable row level security;

-- Deny anon access
create policy "deny_anon_canned_responses" 
    on ai_canned_responses as restrictive 
    for all to anon using (false);

-- Auto-update updated_at timestamp
create trigger trg_canned_responses_updated_at
    before update on ai_canned_responses
    for each row execute function ai_set_updated_at();

-- Insert default canned responses
insert into ai_canned_responses (title, content, shortcut, category) values
    (
        'Welcome Message',
        'Hi there! 👋 I''m here to help you with your car rental query. How can I assist you today?',
        '/hello',
        'greeting'
    ),
    (
        'Transfer to Specialist',
        'Let me connect you with one of our specialists who can better assist you with this request. Please hold for a moment.',
        '/transfer',
        'general'
    ),
    (
        'Booking Confirmation',
        'Your booking has been confirmed! You''ll receive a confirmation email shortly with all the details. Is there anything else I can help you with?',
        '/confirmed',
        'booking'
    ),
    (
        'Check Policy Documents',
        'You can find detailed information about our policies in your booking confirmation email or on our website. Would you like me to explain a specific policy?',
        '/policy',
        'policy'
    ),
    (
        'Technical Issue',
        'I apologize for the technical difficulty. Our IT team has been notified and will resolve this shortly. Can I assist you with anything else in the meantime?',
        '/tech',
        'technical'
    ),
    (
        'Closing Thanks',
        'Thank you for contacting Tashus! If you have any other questions, feel free to reach out anytime. Have a great day! 🚗',
        '/thanks',
        'closing'
    );

-- Add comment to table
comment on table ai_canned_responses is 'Quick reply templates for admin agents during chat handoffs';
