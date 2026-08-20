-- =============================================================================
-- Personal Daily Digest — event timing + dedup identity on cards
-- Run in Supabase SQL Editor after 0010. Idempotent, non-destructive.
--
-- Adds the timing the Opportunity Engine's rules need:
--   starts_at  — when the event happens (used for optional chrono ordering;
--                the human date shown on the card comes from content.startsAt).
--   prune_at   — the "past" boundary. It is the local midnight AFTER the event's
--                last day, so an event is kept through its whole final day and
--                removed the next morning. For a dateless "evergreen" gem it is
--                set to a shelf-life (insertion time + N days) so the deck stays
--                fresh. The daily fill deletes pending public cards whose
--                prune_at <= start-of-today.
--   dedup_key  — a stable identity for one real opportunity. Powers "a dismissed
--                card never comes back" and "don't show the same thing twice":
--                the fill engine skips any dedup_key the user already holds in
--                ANY status (pending / dismissed / saved / accepted).
-- =============================================================================

alter table public.cards
  add column if not exists starts_at timestamptz,
  add column if not exists prune_at  timestamptz,
  add column if not exists dedup_key text;

-- Daily prune + gap-fill counting filter by (user, status, type, prune_at).
create index if not exists cards_user_status_type_prune_idx
  on public.cards (user_id, status, type, prune_at);

-- "Does this user already hold this opportunity?" lookups (dismissal memory).
create index if not exists cards_user_dedup_idx
  on public.cards (user_id, dedup_key);
