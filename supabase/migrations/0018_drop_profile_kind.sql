-- =============================================================================
-- Personal Daily Digest — drop account type (profiles.kind)
-- Run in Supabase SQL Editor after 0017. Idempotent.
--
-- Account "type" (person/org/group) is retired: audience is chosen PER EVENT at
-- creation time (private / team / public), not fixed per account. This removes
-- the column and its check constraint. display_name/bio/links/verified stay.
-- =============================================================================

alter table public.profiles
  drop constraint if exists profiles_kind_check;

alter table public.profiles
  drop column if exists kind;
