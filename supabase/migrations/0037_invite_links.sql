-- =============================================================================
-- Personal Daily Digest — short invite links (/i/<code>)
-- Run in Supabase SQL Editor after 0036.
--
-- Each event can carry one short, unguessable code. Anyone with the link can
-- preview the event and join it (signing up first if they're new). Codes are
-- created lazily the first time someone taps "Copy invite link".
-- =============================================================================

alter table public.events add column if not exists invite_code text;
create unique index if not exists events_invite_code_key on public.events (invite_code);
