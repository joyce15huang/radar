-- =============================================================================
-- Personal Daily Digest — the shared public-event pool (cross-user reuse)
-- Run in Supabase SQL Editor after 0011. Idempotent.
--
-- Sourcing (Tavily + Claude) is expensive and, for public events, identical for
-- everyone in the same city. This lets the scout source each location ONCE per
-- day and fan the results out to every user there, instead of re-querying per
-- user. Per-user deck assembly then reads from here (cheap) and only falls back
-- to a live query when the pool can't fill a gap.
--
-- Written and read ONLY by the server (service-role/admin client). RLS is
-- enabled with NO policies, so it is unreachable from the browser; the
-- service-role key bypasses RLS.
-- =============================================================================

create table if not exists public.sourced_events (
  id            uuid primary key default gen_random_uuid(),
  -- stable identity for one real opportunity in one place; upserts dedupe on it.
  dedup_key     text not null unique,
  -- normalized location this event belongs to (matches a user's location entry).
  location      text not null,
  kind          text not null default 'scout' check (kind in ('scout', 'time_window')),
  category      text not null default 'local',
  title         text not null,
  summary       text not null default '',
  action_label  text not null default 'Read more',
  action_url    text,
  -- REAL source dates, shown on the card (nullable; a gem has neither).
  starts_at     timestamptz,
  ends_at       timestamptz,
  -- boundary the pool is filtered on: rows with prune_at <= today are past.
  prune_at      timestamptz not null,
  -- time_window extras for the countdown.
  expires_at    timestamptz,
  opens_at      timestamptz,
  window_label  text,
  source_domain text,
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now()
);

create index if not exists sourced_events_location_prune_idx
  on public.sourced_events (location, prune_at);

alter table public.sourced_events enable row level security;

-- Tracks when each location was last sourced, so we source a city at most once
-- per day no matter how many users (or manual runs) ask for it that day.
create table if not exists public.sourcing_runs (
  location        text primary key,
  last_sourced_at timestamptz not null default now()
);

alter table public.sourcing_runs enable row level security;
