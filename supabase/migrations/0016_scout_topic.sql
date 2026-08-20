-- =============================================================================
-- Personal Daily Digest — scout "topic" label
-- Run in Supabase SQL Editor after 0015. Idempotent, non-destructive.
-- A short 1-3 word label of WHAT a scouted item is (e.g. "Stargazing",
-- "Live music", "Farmers market", "National park") so an undated/ongoing card
-- can show "<time/period> · <what it is>" on top instead of a bland "Ongoing".
-- Lives on the shared pool so it fans out to every user's card copy.
-- =============================================================================

alter table public.sourced_events
  add column if not exists topic text;
