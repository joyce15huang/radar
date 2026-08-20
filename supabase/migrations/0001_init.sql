-- =============================================================================
-- Personal Daily Digest — Phase 2 schema
-- Run this in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to re-run (idempotent).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles: the "Users" table from the architecture doc. Mirrors auth.users.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- preferences: one row per user holding their plain-English standing prompt.
-- e.g. "I live in SF, care about AI startups, and watch NVDA stock."
-- ---------------------------------------------------------------------------
create table if not exists public.preferences (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  standing_prompt text not null default '',
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- cards: the Micro-Dossier Cards. Populated by the nightly scout (Phase 3),
-- read by the feed (Phase 4).
-- ---------------------------------------------------------------------------
create table if not exists public.cards (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  category     text not null,
  title        text not null,
  summary      text not null,
  action_label text not null default 'Save',
  action_url   text,
  status       text not null default 'pending'
               check (status in ('pending', 'dismissed', 'acted_on')),
  created_at   timestamptz not null default now()
);

create index if not exists cards_user_status_created_idx
  on public.cards (user_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security: every table is private to its owner.
-- ---------------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.preferences enable row level security;
alter table public.cards       enable row level security;

-- profiles
drop policy if exists "own profile - select" on public.profiles;
create policy "own profile - select" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "own profile - update" on public.profiles;
create policy "own profile - update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- preferences
drop policy if exists "own prefs - select" on public.preferences;
create policy "own prefs - select" on public.preferences
  for select using (auth.uid() = user_id);

drop policy if exists "own prefs - insert" on public.preferences;
create policy "own prefs - insert" on public.preferences
  for insert with check (auth.uid() = user_id);

drop policy if exists "own prefs - update" on public.preferences;
create policy "own prefs - update" on public.preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- cards
drop policy if exists "own cards - select" on public.cards;
create policy "own cards - select" on public.cards
  for select using (auth.uid() = user_id);

drop policy if exists "own cards - insert" on public.cards;
create policy "own cards - insert" on public.cards
  for insert with check (auth.uid() = user_id);

drop policy if exists "own cards - update" on public.cards;
create policy "own cards - update" on public.cards
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own cards - delete" on public.cards;
create policy "own cards - delete" on public.cards
  for delete using (auth.uid() = user_id);

-- Note: the nightly scout (Phase 3) will insert cards using the SECRET
-- (service_role) key, which bypasses RLS — so it can write cards for any user.

-- ---------------------------------------------------------------------------
-- Auto-provision a profile + empty preferences row whenever a user signs up.
-- Runs as SECURITY DEFINER so it can write despite RLS.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.preferences (user_id, standing_prompt)
  values (new.id, '')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Keep preferences.updated_at fresh on every save.
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists preferences_touch_updated_at on public.preferences;
create trigger preferences_touch_updated_at
  before update on public.preferences
  for each row execute function public.touch_updated_at();
