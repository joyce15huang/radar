-- =============================================================================
-- Personal Daily Digest — Events, Posts, and social_post cards (SCHEMA ONLY)
-- Run in Supabase SQL Editor after 0004. Idempotent.
-- Storage bucket policies live in 0006 (kept separate so a storage permission
-- error can't roll back this schema).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. events
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users (id) on delete cascade,
  title      text not null,
  event_time text,
  location   text,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.events enable row level security;

drop policy if exists "events - creator manages" on public.events;
create policy "events - creator manages" on public.events
  for all using (auth.uid() = creator_id) with check (auth.uid() = creator_id);

-- ---------------------------------------------------------------------------
-- 2. cards.event_id + social_post type  (MUST come before the attendee policy
--    below, which references cards.event_id)
-- ---------------------------------------------------------------------------
alter table public.cards
  add column if not exists event_id uuid references public.events (id) on delete set null;

alter table public.cards drop constraint if exists cards_type_check;
alter table public.cards
  add constraint cards_type_check
  check (type in ('news_scout', 'social_ping', 'social_invite', 'calendar_radar', 'social_post'));

-- ---------------------------------------------------------------------------
-- 3. events attendee-read policy (now that cards.event_id exists)
-- ---------------------------------------------------------------------------
drop policy if exists "events - attendee reads" on public.events;
create policy "events - attendee reads" on public.events
  for select using (
    exists (
      select 1 from public.cards c
      where c.event_id = events.id and c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. posts
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references auth.users (id) on delete cascade,
  image_path text,
  caption    text,
  event_id   uuid references public.events (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.posts enable row level security;

drop policy if exists "posts - author manages" on public.posts;
create policy "posts - author manages" on public.posts
  for all using (auth.uid() = author_id) with check (auth.uid() = author_id);

drop policy if exists "posts - authenticated read" on public.posts;
create policy "posts - authenticated read" on public.posts
  for select using (auth.role() = 'authenticated');

create index if not exists posts_author_created_idx on public.posts (author_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. profiles: signed-in users can read others' basic profile (public walls)
-- ---------------------------------------------------------------------------
drop policy if exists "profiles - authenticated read" on public.profiles;
create policy "profiles - authenticated read" on public.profiles
  for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- 6. Storage bucket for post images (the bucket insert is safe here; the
--    storage.objects POLICIES are in 0006 to avoid rollback risk).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do nothing;
