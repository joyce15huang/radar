-- 0033_event_broadcast.sql
-- Marks an event as a follower broadcast (a Public event fanned out to all of
-- the host's followers). Used to enforce a per-source daily cap (anti-flood)
-- and, later, to identify broadcast cards for deck bundling.

alter table public.events
  add column if not exists is_broadcast boolean not null default false;
