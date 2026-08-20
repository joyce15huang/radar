-- =============================================================================
-- Personal Daily Digest — time_window card type (the "scarcity" card)
-- Run in Supabase SQL Editor after 0006. Idempotent.
-- Adds the Opportunity Engine's Time axis: expiring opportunities (meteor
-- showers, permit lotteries, pop-ups) surfaced with a countdown. No new table —
-- time_window rides the existing polymorphic cards table; the deadline lives in
-- content->>'expiresAt' (ISO), consistent with how startsAt is already stored.
-- =============================================================================

alter table public.cards drop constraint if exists cards_type_check;
alter table public.cards
  add constraint cards_type_check
  check (type in (
    'news_scout',
    'social_ping',
    'social_invite',
    'calendar_radar',
    'social_post',
    'time_window'
  ));
