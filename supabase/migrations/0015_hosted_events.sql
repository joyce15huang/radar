-- =============================================================================
-- Personal Daily Digest — Hosted events (promote → invite → host-edit → recap)
-- Run in Supabase SQL Editor after 0014. Idempotent, non-destructive.
--
-- Turns a discovered public card (a time_window like a meteor shower, or a
-- personal schedule item) into a shared event you HOST. The event row is the
-- source of truth; each attendee holds a denormalized social_invite card copy.
--   * source_url / summary / category / expires_at / opens_at — preserve the
--     original scouted details + link + countdown when promoted from a public card.
--   * starts_at — ISO start carried onto the event for reference/sorting.
--   * allow_reinvite — host toggle: may guests invite other people?
-- Also allows the new `event_update` card type: a "details updated" heads-up that
-- the host's edits drop on top of each guest's Today deck.
-- =============================================================================

alter table public.events
  add column if not exists source_url     text,
  add column if not exists summary        text,
  add column if not exists category       text,
  add column if not exists starts_at      text,
  add column if not exists expires_at     text,
  add column if not exists opens_at       text,
  add column if not exists allow_reinvite boolean not null default false;

-- Allow the event_update card type (host-edit heads-up surfaced on Today).
alter table public.cards drop constraint if exists cards_type_check;
alter table public.cards add constraint cards_type_check check (
  type in (
    'news_scout', 'time_window', 'social_ping', 'social_invite',
    'calendar_radar', 'social_post', 'event_update'
  )
);
