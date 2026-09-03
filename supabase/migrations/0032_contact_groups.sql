-- =============================================================================
-- Personal Daily Digest — Contact groups (private rosters / "My Groups")
-- Run in Supabase SQL Editor after 0031.
--
-- A group is a named, PRIVATE bucket of people the owner manages (e.g. "Thursday
-- Hoops", "Close Friends"). Members are NOT notified and cannot see the group —
-- it's purely the host's organizational convenience for choosing an audience.
-- When a group is picked as an event's audience, its members are expanded into
-- the recipient list and the existing write-time fan-out delivers the cards.
-- =============================================================================

create table if not exists public.contact_groups (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create index if not exists contact_groups_owner_idx on public.contact_groups (owner_id);

create table if not exists public.group_members (
  group_id   uuid not null references public.contact_groups (id) on delete cascade,
  member_id  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, member_id)
);

alter table public.contact_groups enable row level security;
alter table public.group_members enable row level security;

-- Only the owner touches their groups.
drop policy if exists "contact_groups - owner manages" on public.contact_groups;
create policy "contact_groups - owner manages" on public.contact_groups
  for all using (public.owns_profile(owner_id)) with check (public.owns_profile(owner_id));

-- Only the group's owner touches its membership (members can't see the group).
drop policy if exists "group_members - owner manages" on public.group_members;
create policy "group_members - owner manages" on public.group_members
  for all using (
    exists (select 1 from public.contact_groups g where g.id = group_members.group_id and public.owns_profile(g.owner_id))
  ) with check (
    exists (select 1 from public.contact_groups g where g.id = group_members.group_id and public.owns_profile(g.owner_id))
  );
