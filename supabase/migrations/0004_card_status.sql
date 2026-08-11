-- =============================================================================
-- Personal Daily Digest — expand card statuses for Library + Calendar
-- Run in Supabase SQL Editor after 0003. Idempotent, non-destructive.
--   pending   → in today's deck
--   dismissed → cleared, hidden
--   saved     → kept on the Library wall
--   accepted  → RSVP'd / added to the Calendar
-- =============================================================================

alter table public.cards drop constraint if exists cards_status_check;

alter table public.cards
  add constraint cards_status_check
  check (status in ('pending', 'dismissed', 'saved', 'accepted', 'acted_on'));

-- Fold any legacy "acted_on" cards into the new "saved" bucket.
update public.cards set status = 'saved' where status = 'acted_on';
