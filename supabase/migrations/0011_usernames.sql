-- =============================================================================
-- Personal Daily Digest — usernames (public handles for finding friends)
-- Run in Supabase SQL Editor after 0010. Idempotent.
--
-- Adds a chosen handle to profiles so people add friends by @username instead of
-- email. Nullable at the column level (existing rows have none yet); the app
-- forces every signed-in user through /onboarding to pick one. Stored lowercased;
-- uniqueness is case-insensitive via the lower() index.
-- =============================================================================

alter table public.profiles
  add column if not exists username text;

-- Format guard: 3–20 chars, lowercase letters / digits / underscore. Null allowed
-- (a user who hasn't onboarded yet).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_username_format'
  ) then
    alter table public.profiles
      add constraint profiles_username_format
      check (username is null or username ~ '^[a-z0-9_]{3,20}$');
  end if;
end $$;

-- Case-insensitive uniqueness. (Values are already stored lowercased by the app,
-- but lower() keeps the guarantee even if a row is written directly.)
create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(username));
