-- =============================================================================
-- Personal Daily Digest — Expense ledger (event add-on module)
-- Run in Supabase SQL Editor after 0022. Idempotent.
--
-- A contained, per-event bill-splitter. Each line item has a PAYER (posted_by,
-- who is owed), an amount (integer cents), and the participants who split it
-- (shared_by). No global debt — the math lives entirely inside one event.
-- Per-item ownership: anyone on the guest list can add items; only the poster
-- can edit/delete their own (enforced by RLS via owns_profile).
-- =============================================================================

create table if not exists public.event_line_items (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  posted_by    uuid not null references public.profiles (id) on delete cascade,
  description  text not null,
  amount_cents int  not null check (amount_cents >= 0),
  shared_by    uuid[] not null default '{}',
  created_at   timestamptz not null default now()
);

create index if not exists event_line_items_event_idx on public.event_line_items (event_id);

alter table public.event_line_items enable row level security;

-- Read: anyone on this event's guest list (holds a card for it).
drop policy if exists "ledger - guest read" on public.event_line_items;
create policy "ledger - guest read" on public.event_line_items
  for select using (
    exists (
      select 1 from public.cards c
      where c.event_id = event_line_items.event_id and public.owns_profile(c.user_id)
    )
  );

-- Manage: only the poster (a persona the caller owns).
drop policy if exists "ledger - poster manages" on public.event_line_items;
create policy "ledger - poster manages" on public.event_line_items
  for all using (public.owns_profile(posted_by)) with check (public.owns_profile(posted_by));
