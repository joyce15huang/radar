-- =============================================================================
-- Personal Daily Digest — Multiple personas under one login
-- Run in Supabase SQL Editor after 0018. Idempotent.
--
-- Model change: a profile is no longer 1:1 with an auth user. One login
-- (auth.users) can OWN many profiles ("personas") and switch between them.
--   • profiles.id becomes a standalone uuid (was = auth.users.id).
--   • profiles.owner_id → auth.users.id is the login that owns the persona.
--   • Every actor-scoped table (preferences/cards/events/posts/friendships)
--     now references profiles(id) instead of auth.users(id) — the "actor" is a
--     PROFILE, not a login.
--
-- Existing data stays valid with ZERO row rewrites: each existing user already
-- has exactly one profile whose id == their auth uid, so it simply becomes
-- their PRIMARY persona (owner_id backfilled to that same id), and every
-- existing user_id/creator_id/etc already equals that profile id.
-- =============================================================================

-- ── 1. profiles: add owner_id, decouple id from auth.users ──────────────────
alter table public.profiles
  add column if not exists owner_id uuid;

update public.profiles set owner_id = id where owner_id is null;

alter table public.profiles alter column owner_id set not null;

-- id was `references auth.users(id)`; drop that so a persona id can be a fresh
-- uuid unrelated to any login. owner_id carries the auth link now.
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_owner_id_fkey') then
    alter table public.profiles
      add constraint profiles_owner_id_fkey
      foreign key (owner_id) references auth.users (id) on delete cascade;
  end if;
end $$;

create index if not exists profiles_owner_idx on public.profiles (owner_id);

-- ── 2. Repoint actor FKs from auth.users(id) → profiles(id) ─────────────────
-- (Existing values already equal a primary-persona profile id, so every FK is
--  satisfied immediately.)
alter table public.preferences drop constraint if exists preferences_user_id_fkey;
alter table public.preferences
  add constraint preferences_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.cards drop constraint if exists cards_user_id_fkey;
alter table public.cards
  add constraint cards_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.cards drop constraint if exists cards_sender_id_fkey;
alter table public.cards
  add constraint cards_sender_id_fkey
  foreign key (sender_id) references public.profiles (id) on delete set null;

alter table public.events drop constraint if exists events_creator_id_fkey;
alter table public.events
  add constraint events_creator_id_fkey
  foreign key (creator_id) references public.profiles (id) on delete cascade;

alter table public.posts drop constraint if exists posts_author_id_fkey;
alter table public.posts
  add constraint posts_author_id_fkey
  foreign key (author_id) references public.profiles (id) on delete cascade;

alter table public.friendships drop constraint if exists friendships_requester_id_fkey;
alter table public.friendships
  add constraint friendships_requester_id_fkey
  foreign key (requester_id) references public.profiles (id) on delete cascade;

alter table public.friendships drop constraint if exists friendships_addressee_id_fkey;
alter table public.friendships
  add constraint friendships_addressee_id_fkey
  foreign key (addressee_id) references public.profiles (id) on delete cascade;

-- ── 3. Ownership helper: does the current login own this profile? ───────────
create or replace function public.owns_profile(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = pid and owner_id = auth.uid()
  );
$$;

-- ── 4. Rewrite RLS: "mine" now means "a persona I own" ──────────────────────

-- profiles: anyone authenticated may READ any profile (needed for /u/[id],
-- friends, invites); the OWNER may insert/update/delete their own personas.
drop policy if exists "own profile - select" on public.profiles;
drop policy if exists "own profile - update" on public.profiles;
drop policy if exists "profiles - owner manages" on public.profiles;
create policy "profiles - owner manages" on public.profiles
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- (The 0005 "profiles - authenticated read" SELECT policy stays and grants read.)

-- preferences
drop policy if exists "own prefs - select" on public.preferences;
drop policy if exists "own prefs - insert" on public.preferences;
drop policy if exists "own prefs - update" on public.preferences;
create policy "own prefs - select" on public.preferences
  for select using (public.owns_profile(user_id));
create policy "own prefs - insert" on public.preferences
  for insert with check (public.owns_profile(user_id));
create policy "own prefs - update" on public.preferences
  for update using (public.owns_profile(user_id)) with check (public.owns_profile(user_id));

-- cards
drop policy if exists "own cards - select" on public.cards;
drop policy if exists "own cards - insert" on public.cards;
drop policy if exists "own cards - update" on public.cards;
drop policy if exists "own cards - delete" on public.cards;
create policy "own cards - select" on public.cards
  for select using (public.owns_profile(user_id));
create policy "own cards - insert" on public.cards
  for insert with check (public.owns_profile(user_id));
create policy "own cards - update" on public.cards
  for update using (public.owns_profile(user_id)) with check (public.owns_profile(user_id));
create policy "own cards - delete" on public.cards
  for delete using (public.owns_profile(user_id));

-- events
drop policy if exists "events - creator manages" on public.events;
drop policy if exists "events - attendee reads" on public.events;
create policy "events - creator manages" on public.events
  for all using (public.owns_profile(creator_id)) with check (public.owns_profile(creator_id));
create policy "events - attendee reads" on public.events
  for select using (
    exists (
      select 1 from public.cards c
      where c.event_id = events.id and public.owns_profile(c.user_id)
    )
  );

-- posts: author manages; authenticated read stays (0005).
drop policy if exists "posts - author manages" on public.posts;
create policy "posts - author manages" on public.posts
  for all using (public.owns_profile(author_id)) with check (public.owns_profile(author_id));

-- friendships
drop policy if exists "friendships - parties read" on public.friendships;
drop policy if exists "friendships - requester inserts" on public.friendships;
drop policy if exists "friendships - parties update" on public.friendships;
drop policy if exists "friendships - parties delete" on public.friendships;
create policy "friendships - parties read" on public.friendships
  for select using (public.owns_profile(requester_id) or public.owns_profile(addressee_id));
create policy "friendships - requester inserts" on public.friendships
  for insert with check (public.owns_profile(requester_id));
create policy "friendships - parties update" on public.friendships
  for update using (public.owns_profile(requester_id) or public.owns_profile(addressee_id))
  with check (public.owns_profile(requester_id) or public.owns_profile(addressee_id));
create policy "friendships - parties delete" on public.friendships
  for delete using (public.owns_profile(requester_id) or public.owns_profile(addressee_id));

-- ── 5. Signup provisions the PRIMARY persona (owner_id = its own id) ─────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, owner_id, email)
  values (new.id, new.id, new.email)
  on conflict (id) do nothing;

  insert into public.preferences (user_id, standing_prompt)
  values (new.id, '')
  on conflict (user_id) do nothing;

  return new;
end;
$$;
