-- =============================================================================
-- Personal Daily Digest — Task delegation (event add-on module)
-- Run in Supabase SQL Editor after 0023. Idempotent.
--
-- A checklist attached to one event. Anyone on the guest list can add a task;
-- anyone can claim one (assign it to themselves) or mark it done; only the
-- creator can delete it. Claim/done toggles go through service-role actions.
-- =============================================================================

create table if not exists public.event_tasks (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  created_by  uuid not null references public.profiles (id) on delete cascade,
  assignee_id uuid references public.profiles (id) on delete set null,
  title       text not null,
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists event_tasks_event_idx on public.event_tasks (event_id);

alter table public.event_tasks enable row level security;

drop policy if exists "tasks - guest read" on public.event_tasks;
create policy "tasks - guest read" on public.event_tasks
  for select using (
    exists (
      select 1 from public.cards c
      where c.event_id = event_tasks.event_id and public.owns_profile(c.user_id)
    )
  );

drop policy if exists "tasks - creator manages" on public.event_tasks;
create policy "tasks - creator manages" on public.event_tasks
  for all using (public.owns_profile(created_by)) with check (public.owns_profile(created_by));
