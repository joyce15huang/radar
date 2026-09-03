-- =============================================================================
-- Personal Daily Digest — Facebook-style friendships (request → accept, mutual)
-- Run in Supabase SQL Editor after 0035. See `claude/Friends Model Decision`.
--
-- The product graph for regular accounts is FRIENDS: an explicit, mutual,
-- consented relationship. `follows` (0031) stays in place, dormant, as the
-- substrate for the future public-accounts (one-way Follow) roadmap item.
--
-- One row per relationship. status: 'pending' (a request awaiting the
-- addressee) → 'accepted' (they're friends). Decline / cancel / unfriend all
-- delete the row. unique(requester,addressee) blocks a duplicate request in the
-- same direction; the reverse direction is handled in the action layer (a tap
-- to add someone who already requested you auto-accepts).
-- =============================================================================

create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);
create index if not exists friendships_requester_idx on public.friendships (requester_id, status);

alter table public.friendships enable row level security;

-- Either party can read a row (your friends, your incoming and outgoing requests).
drop policy if exists "friendships - involved reads" on public.friendships;
create policy "friendships - involved reads" on public.friendships
  for select using (public.owns_profile(requester_id) or public.owns_profile(addressee_id));

-- You create only requests you send.
drop policy if exists "friendships - requester inserts" on public.friendships;
create policy "friendships - requester inserts" on public.friendships
  for insert with check (public.owns_profile(requester_id));

-- Only the addressee updates (accept).
drop policy if exists "friendships - addressee updates" on public.friendships;
create policy "friendships - addressee updates" on public.friendships
  for update using (public.owns_profile(addressee_id)) with check (public.owns_profile(addressee_id));

-- Either party can delete (cancel a request / decline / unfriend).
drop policy if exists "friendships - involved deletes" on public.friendships;
create policy "friendships - involved deletes" on public.friendships
  for delete using (public.owns_profile(requester_id) or public.owns_profile(addressee_id));
