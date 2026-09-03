-- =============================================================================
-- Personal Daily Digest — Carpool (event add-on module)
-- Run in Supabase SQL Editor after 0021. Idempotent.
--
-- A rides board scoped to one event. Anyone on the guest list can offer a ride
-- with N seats; others claim a seat. Per-owner edit: only the driver manages
-- their ride. Seat claims/releases go through a service-role action that only
-- ever adds/removes the caller, so the array stays honest without per-element RLS.
-- =============================================================================

create table if not exists public.event_rides (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  driver_id     uuid not null references public.profiles (id) on delete cascade,
  seats         int  not null default 3 check (seats between 1 and 20),
  note          text,
  passenger_ids uuid[] not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists event_rides_event_idx on public.event_rides (event_id);

alter table public.event_rides enable row level security;

-- Read: anyone on this event's guest list (holds a card for it).
drop policy if exists "rides - guest read" on public.event_rides;
create policy "rides - guest read" on public.event_rides
  for select using (
    exists (
      select 1 from public.cards c
      where c.event_id = event_rides.event_id and public.owns_profile(c.user_id)
    )
  );

-- Manage: only the driver (a persona the caller owns). Seat claims by passengers
-- go through the service-role action, which bypasses RLS.
drop policy if exists "rides - driver manages" on public.event_rides;
create policy "rides - driver manages" on public.event_rides
  for all using (public.owns_profile(driver_id)) with check (public.owns_profile(driver_id));
