-- =============================================================================
-- Personal Daily Digest — 2-way friendships (friend requests)
-- Run in Supabase SQL Editor after 0009. Idempotent.
--
-- A single row models the relationship between two users. `requester_id` is who
-- sent the request, `addressee_id` is who received it. `status` walks
-- pending → accepted / declined. One row per unordered pair (enforced by the
-- expression unique index below), so a re-request reuses the same row.
--
-- RLS: both parties can read and act on their own relationship rows. No
-- service-role fan-out is needed — the acting user is always a party, so the
-- normal (cookie-authenticated) client is sufficient and safe.
-- =============================================================================

create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  constraint friendships_no_self check (requester_id <> addressee_id)
);

-- One relationship per unordered pair {a, b}: prevents both A→B and B→A rows.
create unique index if not exists friendships_pair_uidx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

-- Fast lookups for the Friends page (incoming/outgoing/accepted).
create index if not exists friendships_addressee_status_idx
  on public.friendships (addressee_id, status);
create index if not exists friendships_requester_status_idx
  on public.friendships (requester_id, status);

alter table public.friendships enable row level security;

-- Both parties can see the relationship.
drop policy if exists "friendships - parties read" on public.friendships;
create policy "friendships - parties read" on public.friendships
  for select using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- You may only create a request where YOU are the requester.
drop policy if exists "friendships - requester inserts" on public.friendships;
create policy "friendships - requester inserts" on public.friendships
  for insert with check (auth.uid() = requester_id);

-- Either party may update the row (addressee accepts/declines; a declined row
-- can be revived into a fresh pending request). The row must still belong to the
-- acting user before and after the change.
drop policy if exists "friendships - parties update" on public.friendships;
create policy "friendships - parties update" on public.friendships
  for update
  using (auth.uid() = requester_id or auth.uid() = addressee_id)
  with check (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Either party may delete: the requester cancels a pending request, or either
-- side unfriends.
drop policy if exists "friendships - parties delete" on public.friendships;
create policy "friendships - parties delete" on public.friendships
  for delete using (auth.uid() = requester_id or auth.uid() = addressee_id);
