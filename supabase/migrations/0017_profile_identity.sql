-- =============================================================================
-- Personal Daily Digest — Profile identity (account kinds + trust fields)
-- Run in Supabase SQL Editor after 0005/0006. Additive + idempotent; no regression.
-- =============================================================================

alter table public.profiles
  add column if not exists kind         text not null default 'person',
  add column if not exists display_name text,
  add column if not exists bio          text,
  add column if not exists links        jsonb not null default '{}'::jsonb,  -- {website, instagram, twitter}
  add column if not exists avatar_path  text,
  add column if not exists verified     boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_kind_check') then
    alter table public.profiles
      add constraint profiles_kind_check check (kind in ('person', 'org', 'group'));
  end if;
end $$;
