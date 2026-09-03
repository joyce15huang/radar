-- =============================================================================
-- Personal Daily Digest — One-way follow graph (replaces two-way friendships)
-- Run in Supabase SQL Editor after 0030.
--
-- We drop the two-way `friendships` model entirely (starting fresh — no real
-- users yet) in favor of a one-way `follows`: A follows B with no approval step.
-- This is the audience primitive for broadcast (a public profile → its
-- followers) and the convenient "people I follow" list for picking recipients.
-- Distribution stays write-time fan-out (one card row per recipient); follows
-- only change how a recipient list is produced.
-- =============================================================================

drop table if exists public.friendships cascade;

create table if not exists public.follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists follows_following_idx on public.follows (following_id);

alter table public.follows enable row level security;

-- You manage only your OWN follow rows (who you follow).
drop policy if exists "follows - self manages" on public.follows;
create policy "follows - self manages" on public.follows
  for all using (public.owns_profile(follower_id)) with check (public.owns_profile(follower_id));

-- You can read a row if you're either side (your following, and your followers).
drop policy if exists "follows - involved reads" on public.follows;
create policy "follows - involved reads" on public.follows
  for select using (public.owns_profile(follower_id) or public.owns_profile(following_id));
