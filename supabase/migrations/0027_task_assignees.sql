-- =============================================================================
-- Personal Daily Digest — Per-person task assignees (event add-on module)
-- Run in Supabase SQL Editor after 0026. Idempotent.
--
-- A task no longer has one assignee + one done flag. Instead it carries a SET
-- of assignees (a chosen subset of the guest list), and EACH assignee has their
-- own done state. This one shape covers every case:
--   • one person      → a subset of size 1
--   • everyone        → subset = the whole guest list
--   • any subset      → pick specific people
--   • open/unclaimed  → zero assignees; anyone may add themselves
-- The task's progress is derived: done = count(done rows) / count(assignees).
-- The legacy event_tasks.assignee_id / done columns are left in place (ignored
-- by the app) and their data is migrated into this table below.
-- =============================================================================

create table if not exists public.event_task_assignees (
  task_id    uuid not null references public.event_tasks (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  done       boolean not null default false,
  done_at    timestamptz,
  primary key (task_id, profile_id)
);

create index if not exists event_task_assignees_task_idx
  on public.event_task_assignees (task_id);

alter table public.event_task_assignees enable row level security;

-- Anyone on the task's event guest list may read the assignee rows.
drop policy if exists "task_assignees - guest read" on public.event_task_assignees;
create policy "task_assignees - guest read" on public.event_task_assignees
  for select using (
    exists (
      select 1
      from public.event_tasks t
      join public.cards c on c.event_id = t.event_id
      where t.id = event_task_assignees.task_id
        and public.owns_profile(c.user_id)
    )
  );

-- You may flip your own done state.
drop policy if exists "task_assignees - self manages" on public.event_task_assignees;
create policy "task_assignees - self manages" on public.event_task_assignees
  for update using (public.owns_profile(profile_id)) with check (public.owns_profile(profile_id));

-- One-time migration of existing single-assignee tasks into the new table,
-- carrying their done state. Safe to re-run.
insert into public.event_task_assignees (task_id, profile_id, done)
select id, assignee_id, done
from public.event_tasks
where assignee_id is not null
on conflict (task_id, profile_id) do nothing;
