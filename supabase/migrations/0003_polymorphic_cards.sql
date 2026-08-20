-- =============================================================================
-- Personal Daily Digest — Pivot V1: make the Cards table polymorphic
-- Run in Supabase SQL Editor after 0001 + 0002. Idempotent, non-destructive.
-- (Supabase will warn about "destructive operations" for the ALTER/UPDATE — it's
--  only relaxing NOT NULLs and backfilling; no data is dropped.)
-- =============================================================================

-- New polymorphic columns.
alter table public.cards
  add column if not exists type text not null default 'news_scout',
  add column if not exists sender_id uuid references auth.users (id) on delete set null,
  add column if not exists content jsonb not null default '{}'::jsonb;

-- Constrain the card type to the known taxonomy (extensible — add members here).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cards_type_check'
  ) then
    alter table public.cards
      add constraint cards_type_check
      check (type in ('news_scout', 'social_ping', 'social_invite', 'calendar_radar'));
  end if;
end $$;

-- Legacy columns become optional — new card types keep their fields in `content`.
alter table public.cards alter column title drop not null;
alter table public.cards alter column category drop not null;
alter table public.cards alter column summary drop not null;
alter table public.cards alter column action_label drop not null;

-- Backfill existing news rows: move their legacy fields into `content`.
update public.cards
set content = jsonb_strip_nulls(
  jsonb_build_object(
    'category', category,
    'summary', summary,
    'actionLabel', action_label,
    'actionUrl', action_url
  )
)
where type = 'news_scout'
  and (content is null or content = '{}'::jsonb);

create index if not exists cards_user_status_type_idx
  on public.cards (user_id, status, type, created_at desc);
