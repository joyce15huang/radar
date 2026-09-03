-- =============================================================================
-- Personal Daily Digest — Event participation fee
-- Run in Supabase SQL Editor after 0019. Idempotent.
--
-- An optional flat fee to join a hosted event, plus the host's payment deep-link.
-- The app does NOT process money — attendees confirm payment with a manual tap,
-- stored per-attendee on their own invite card (content.feePaid). These two
-- columns hold the host-set fee (integer cents) and the pay link.
-- =============================================================================

alter table public.events
  add column if not exists fee_cents    integer,
  add column if not exists payment_link text;
