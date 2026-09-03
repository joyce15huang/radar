-- 0035_people_seen.sql
-- Tracks when the actor last opened the People tab, so the nav can badge that
-- tab with how many followers have arrived since. NULL = never opened yet
-- (every current follower counts as new until the first visit).

alter table public.profiles
  add column if not exists people_seen_at timestamptz;
