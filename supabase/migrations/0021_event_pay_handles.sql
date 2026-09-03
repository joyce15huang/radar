-- =============================================================================
-- Personal Daily Digest — Venmo / Zelle handles for the event fee
-- Run in Supabase SQL Editor after 0020. Idempotent.
--
-- Replaces the single free-form payment_link with structured handles the host
-- can enter and attendees can act on: a Venmo username (→ a pay deep-link) and a
-- Zelle id (email/phone, shown to copy). payment_link stays for back-compat.
-- =============================================================================

alter table public.events
  add column if not exists venmo_id text,
  add column if not exists zelle_id text;
