-- 0028_topic_key.sql
-- Cross-source, cross-day dedup for scouted cards. The existing dedup_key is
-- normalized-title + day + location, so the SAME event from two outlets (different
-- headlines) escapes it. topic_key is the model's canonical event slug scoped to
-- the event's month (e.g. "perseids meteor shower|2025-08"); the fill engine
-- suppresses any topic_key the user has already held, so a repeat of the same
-- event from a different source is never shown again.
-- Existing rows get NULL and simply fall back to the title-based dedup_key.

alter table public.cards
  add column if not exists topic_key text;

alter table public.sourced_events
  add column if not exists topic_key text;

create index if not exists cards_topic_key_idx
  on public.cards (user_id, topic_key)
  where topic_key is not null;

create index if not exists sourced_events_topic_key_idx
  on public.sourced_events (topic_key)
  where topic_key is not null;
