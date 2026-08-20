-- =============================================================================
-- Personal Daily Digest — add weekly digest support
-- Run in Supabase SQL Editor after 0001_init.sql. Idempotent.
-- =============================================================================

-- A second, optional standing prompt whose cards are generated on Mondays only.
alter table public.preferences
  add column if not exists weekly_prompt text not null default '';
