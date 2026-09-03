-- =============================================================================
-- Personal Daily Digest — Event comments / updates thread (add-on module)
-- Run in Supabase SQL Editor after 0024. Idempotent.
--
-- A simple discussion thread on one event (distinct from the `event_update`
-- feed heads-up). Anyone on the guest list can read + post; only the author can
-- delete their own comment. Posts go through a service-role action.
-- =============================================================================

create table if not exists public.event_comments (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists event_comments_event_idx on public.event_comments (event_id, created_at);

alter table public.event_comments enable row level security;

drop policy if exists "comments - guest read" on public.event_comments;
create policy "comments - guest read" on public.event_comments
  for select using (
    exists (
      select 1 from public.cards c
      where c.event_id = event_comments.event_id and public.owns_profile(c.user_id)
    )
  );

drop policy if exists "comments - author manages" on public.event_comments;
create policy "comments - author manages" on public.event_comments
  for all using (public.owns_profile(author_id)) with check (public.owns_profile(author_id));
