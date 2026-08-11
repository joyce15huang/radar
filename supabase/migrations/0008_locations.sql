-- =============================================================================
-- Personal Daily Digest — user locations (the Opportunity Engine's one input)
-- Run in Supabase SQL Editor after 0007. Idempotent.
-- Replaces the free-text daily/weekly prompt UI with a list of cities. The scout
-- still reads preferences.standing_prompt (now auto-derived from these cities),
-- so the pipeline is unchanged — this column just makes the list editable.
-- =============================================================================

alter table public.preferences
  add column if not exists locations text[] not null default '{}';
